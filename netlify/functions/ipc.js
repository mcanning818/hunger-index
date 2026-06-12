const BASE = 'https://api.ipcinfo.org/v2';

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

  console.log(`[IPC] Fetching data for ${iso3}`);

  const endpoints = {
    country: `${BASE}/country?key=${IPC_API_KEY}&country=${iso3}&format=json`,
    population: `${BASE}/population?key=${IPC_API_KEY}&country=${iso3}&format=json`,
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
          results[key] = [];
          return;
        }

        const data = await r.json();
        results[key] = data;
        const count = Array.isArray(data) ? data.length : (data ? 1 : 0);
        console.log(`[IPC] ${key}: ${count} records`);
        console.log(`[IPC] ${key} raw response:`, JSON.stringify(data).slice(0, 500));

      } catch (err) {
        console.warn(`[IPC] ${key} error: ${err.message}`);
        results[key] = [];
      }
    })
  );

  const current = results.population || [];
  const projection = [];
  const countrySummary = results.country || {};

  function extractPhaseData(records) {
    if (!Array.isArray(records)) return null;

    const phases = { p1: 0, p2: 0, p3: 0, p4: 0, p5: 0, total: 0 };

    records.forEach(area => {
      if (area.phases && Array.isArray(area.phases)) {
        area.phases.forEach(p => {
          const pid = p.phase_id || p.phase;
          const pop = p.population || p.pop || 0;
          if (pid === 1) phases.p1 += pop;
          if (pid === 2) phases.p2 += pop;
          if (pid === 3) phases.p3 += pop;
          if (pid === 4) phases.p4 += pop;
          if (pid === 5) phases.p5 += pop;
        });
      }
      if (area.phase3 !== undefined) {
        phases.p3 += area.phase3 || 0;
        phases.p4 += area.phase4 || 0;
        phases.p5 += area.phase5 || 0;
      }
    });

    phases.total = phases.p1 + phases.p2 + phases.p3 + phases.p4 + phases.p5;
    phases.phase3plus = phases.p3 + phases.p4 + phases.p5;

    let overallPhase = 1;
    if (phases.p5 > 1000) overallPhase = 5;
    else if (phases.p4 > 10000) overallPhase = 4;
    else if (phases.p3 > 50000) overallPhase = 3;
    else if (phases.p2 > 100000) overallPhase = 2;

    return { ...phases, overallPhase };
  }

  const currentPhases = extractPhaseData(current);
  const projectionPhases = extractPhaseData(projection);

  const refPeriod = current[0]?.reference_period ||
                    current[0]?.period ||
                    countrySummary?.current_period || null;

  const hasData = currentPhases && currentPhases.total > 0;

  console.log(`[IPC] ${iso3} — hasData: ${hasData}, phase3plus: ${currentPhases?.phase3plus || 0}`);

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      status: hasData ? 'live' : 'unavailable',
      iso3,
      data: {
        current: currentPhases,
        projection: projectionPhases,
        referencePeriod: refPeriod,
        countrySummary: Array.isArray(countrySummary) ? countrySummary[0] : countrySummary,
        rawCurrent: current.slice(0, 5),
      },
      timestamp: new Date().toISOString()
    })
  };
};
