exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // ATTEMPT 1: ReliefWeb v2 (requires approved appname — will activate automatically once approved)
  try {
    const RELIEFWEB_URL = 'https://api.reliefweb.int/v2/reports?appname=thehungerindex&limit=20';
    const body = JSON.stringify({
      limit: 20,
      sort: ['date.created:desc'],
      fields: { include: ['title', 'date.created', 'source', 'country', 'body', 'url'] },
      filter: {
        operator: 'OR',
        conditions: [
          { field: 'theme.name', value: 'Food and Nutrition' },
          { field: 'theme.name', value: 'Agriculture' },
          { field: 'source.name', value: 'WFP' },
          { field: 'source.name', value: 'FEWS NET' },
          { field: 'source.name', value: 'UN OCHA' }
        ]
      }
    });

    const r = await fetch(RELIEFWEB_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body,
      signal: AbortSignal.timeout(10000)
    });

    if (!r.ok) throw new Error(`ReliefWeb returned HTTP ${r.status}`);
    const data = await r.json();

    const items = (data.data || []).map(item => {
      const f = item.fields || {};
      const country = (f.country || [])[0]?.name || '';
      const source = (f.source || [])[0]?.name || 'ReliefWeb';
      const dateStr = f['date.created'] || '';
      let fmtDate = dateStr;
      try { fmtDate = new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); } catch(_) {}
      const rawBody = (f.body || '').replace(/<[^>]+>/g, '').trim();
      const body = rawBody.slice(0, 200) || 'See full report on ReliefWeb.';
      const title = (f.title || '').toLowerCase();
      const tags = [];
      if (/famine|ipc.5/.test(title)) tags.push('famine');
      if (/emergency|crisis/.test(title)) tags.push('emergency');
      if (/africa|sudan|somalia|ethiopia|nigeria|drc|kenya|chad|zimbabwe|mozambique/.test(title + country.toLowerCase())) tags.push('africa');
      if (/gaza|yemen|syria|lebanon|middle.east/.test(title + country.toLowerCase())) tags.push('middleeast');
      if (/afghanistan|myanmar|asia/.test(title + country.toLowerCase())) tags.push('asia');
      if (tags.length === 0) tags.push('emergency');
      return { source, title: f.title || 'Untitled', body, date: fmtDate, tags, url: f.url || 'https://reliefweb.int' };
    }).filter(i => i.title.length > 10);

    if (items.length > 0) {
      console.log(`[NEWS] ReliefWeb: ${items.length} articles`);
      return { statusCode: 200, headers, body: JSON.stringify({ status: 'live', source: 'reliefweb', items, count: items.length, timestamp: new Date().toISOString() }) };
    }
    throw new Error('ReliefWeb returned 0 items');
  } catch(err) {
    console.warn(`[NEWS] ReliefWeb failed (${err.message}) — falling back to GDELT`);
  }

  // ATTEMPT 2: GDELT — real-time news, no auth required
  // Pulls from AP, Reuters, BBC, Al Jazeera, NYT filtered to food security topics
  try {
    const queries = [
      'famine+food+insecurity+humanitarian',
      'hunger+crisis+WFP+OCHA',
      'food+security+Sudan+Yemen+Gaza'
    ];

    const allArticles = [];

    for (const q of queries) {
      try {
        const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=artlist&maxrecords=10&sort=datedesc&format=json&timespan=7d`;
        const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!r.ok) continue;
        const data = await r.json();
        const articles = (data.articles || []).map(a => {
          const title = a.title || '';
          const t = title.toLowerCase();
          const tags = [];
          if (/famine|ipc.5/.test(t)) tags.push('famine');
          if (/emergency|crisis/.test(t)) tags.push('emergency');
          if (/africa|sudan|somalia|ethiopia|nigeria|drc|kenya|chad|zimbabwe|mozambique/.test(t)) tags.push('africa');
          if (/gaza|yemen|syria|lebanon|middle.east/.test(t)) tags.push('middleeast');
          if (/afghanistan|myanmar|asia/.test(t)) tags.push('asia');
          if (tags.length === 0) tags.push('emergency');
          return {
            source: a.domain || 'News',
            title,
            body: `Full article available at source.`,
            date: a.seendate ? new Date(a.seendate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '',
            tags,
            url: a.url || ''
          };
        }).filter(a => a.title.length > 10);
        allArticles.push(...articles);
      } catch(_) {}
    }

    const seen = new Set();
    const unique = allArticles.filter(a => {
      if (seen.has(a.title)) return false;
      seen.add(a.title);
      return true;
    }).slice(0, 20);

    if (unique.length > 0) {
      console.log(`[NEWS] GDELT: ${unique.length} articles`);
      return { statusCode: 200, headers, body: JSON.stringify({ status: 'live', source: 'gdelt', items: unique, count: unique.length, timestamp: new Date().toISOString() }) };
    }
    throw new Error('GDELT returned 0 articles');
  } catch(err) {
    console.warn(`[NEWS] GDELT failed: ${err.message}`);
  }

  // ATTEMPT 3: Static fallback
  console.warn('[NEWS] All sources failed — frontend will use static NEWS_DATA');
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ status: 'unavailable', items: [], timestamp: new Date().toISOString() })
  };
};
