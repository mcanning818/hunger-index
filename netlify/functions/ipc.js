exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const IPC_API_KEY = process.env.IPC_API_KEY;
  if (!IPC_API_KEY) {
    console.warn('[IPC] IPC_API_KEY not configured — returning empty');
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: 'unavailable', reason: 'no_key', data: {} })
    };
  }

  const { iso3 } = event.queryStringParameters || {};
  if (!iso3) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'iso3 parameter required' })
    };
  }

  // IPC API uses 2-letter ISO codes
  const ISO3_TO_ISO2 = {
    'SDN': 'SD', 'SSD': 'SS', 'PSE': 'PS', 'YEM': 'YE', 'HTI': 'HT',
    'COD': 'CD', 'AFG': 'AF', 'ETH': 'ET', 'MLI': 'ML', 'SOM': 'SO',
    'MMR': 'MM', 'SYR': 'SY', 'NGA': 'NG', 'ZWE': 'ZW', 'CMR': 'CM',
    'TCD': 'TD', 'KEN': 'KE', 'BFA': 'BF', 'LBN': 'LB', 'COL': 'CO',
    'MOZ': 'MZ', 'TJK': 'TJ', 'GTM': 'GT', 'BDI': 'BI'
  };

  const iso2 = ISO3_TO_ISO2[iso3];
  if (!iso2) {
    return { statusCode: 200, headers, body: JSON.stringify({ status: 'unavailable', reason: 'no_iso2_mapping', data: {} }) };
  }

  console.log(`[IPC] Fetching data for ${iso3} (${iso2})`);

  // /country returns latest analysis with phases[] — primary data source
  // /analyses returns list of past analyses (metadata only, no phase populations)
  const endpoints = {
    country:  `https://api.ipcinfo.org/country?country=${iso2}&key=${IPC_API_KEY}&format=json`,
    analyses: `https://api.ipcinfo.org/analyses?country=${iso2}&type=A&key=${IPC_API_KEY}&format=json`,
  };

  const results = {};

  await Promise.allSettled(
    Object.entries(endpoints).map(async ([key, url]) => {
      try {
        const r = await fetch(url, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'TheHungerIndex/1.0 (thehungerindex.netlify.app; mikahcanning@gmail.com)',
          },
          signal: AbortSignal.timeout(12000)
        });

        if (!r.ok) {
          const errText = await r.text();
          console.warn(`[IPC] ${key} failed: HTTP ${r.status} — ${errText.slice(0, 200)}`);
          results[key] = null;
          return;
        }

        const data = await r.json();
        results[key] = data;
        console.log(`[IPC] ${key}: ${Array.isArray(data) ? data.length : 1} records`);

      } catch (err) {
        console.warn(`[IPC] ${key} error: ${err.message}`);
        results[key] = null;
      }
    })
  );

  // /country returns an array; first item has phases[]
  const countryArr = Array.isArray(results.country) ? results.country : (results.country ? [results.country] : []);
  const summary = countryArr[0] || null;

  // Parse phase populations from summary.phases[]
  function extractPhases(summary) {
    if (!summary || !Array.isArray(summary.phases)) return null;
    const ph = { p1: 0, p2: 0, p3: 0, p4: 0, p5: 0 };
    summary.phases.forEach(p => {
      const pid = Number(p.phase);
      const pop = p.population || 0;
      if (pid >= 1 && pid <= 5) ph['p' + pid] = pop;
    });
    const total = ph.p1 + ph.p2 + ph.p3 + ph.p4 + ph.p5;
    const phase3plus = ph.p3 + ph.p4 + ph.p5;
    let overallPhase = 1;
    if (ph.p5 > 1000) overallPhase = 5;
    else if (ph.p4 > 10000) overallPhase = 4;
    else if (ph.p3 > 50000) overallPhase = 3;
    else if (ph.p2 > 100000) overallPhase = 2;
    return { ...ph, total, phase3plus, overallPhase };
  }

  const currentPhases = extractPhases(summary);
  const hasData = currentPhases && currentPhases.total > 0;

  const refPeriod = summary?.from && summary?.to
    ? `${summary.from} – ${summary.to}`
    : null;

  console.log(`[IPC] ${iso3} — hasData: ${hasData}, P3+: ${currentPhases?.phase3plus?.toLocaleString() || 0}, period: ${refPeriod}`);

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      status: hasData ? 'live' : 'unavailable',
      iso3,
      data: {
        current: currentPhases,
        projection: null,
        referencePeriod: refPeriod,
        countrySummary: summary,
        rawAnalyses: Array.isArray(results.analyses) ? results.analyses.slice(0, 5) : [],
      },
      timestamp: new Date().toISOString()
    })
  };
};
