// Netlify Function: News proxy for ReliefWeb API
// Replaces the /api/news route from server.js
// Called via /.netlify/functions/news (or /api/news via redirect in netlify.toml)

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // ReliefWeb REST API — food security reports
  // Running server-side means no CORS issues
  const RELIEFWEB_URL = 'https://api.reliefweb.int/v1/reports?appname=hunger-index&limit=20';

  const body = JSON.stringify({
    limit: 20,
    sort: ['date.created:desc'],
    fields: {
      include: ['title', 'date.created', 'source', 'country', 'body', 'url']
    },
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

  try {
    const response = await fetch(RELIEFWEB_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'HungerIndex/1.0 (thehungerindex.netlify.app)'
      },
      body,
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      throw new Error(`ReliefWeb returned HTTP ${response.status}`);
    }

    const data = await response.json();

    // Format items for frontend consumption
    // Matches the shape expected by fetchLiveNews() in index.html
    const items = (data.data || []).map(item => {
      const f = item.fields || {};
      const country = (f.country || [])[0]?.name || '';
      const source = (f.source || [])[0]?.name || 'ReliefWeb';
      const dateStr = f['date.created'] || (f.date && f.date.created) || '';
      let fmtDate = dateStr;
      try { fmtDate = new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); } catch(_) {}

      // Strip HTML from body
      const rawBody = (f.body || '').replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').trim();
      const bodyText = rawBody.slice(0, 200) || 'See full report on ReliefWeb.';

      // Auto-tag by country/region
      const title = (f.title || '').toLowerCase();
      const countryLower = country.toLowerCase();
      const tags = [];
      if (/famine|ipc.5/.test(title)) tags.push('famine');
      if (/emergency|ipc.4/.test(title)) tags.push('emergency');
      if (/africa|sudan|somalia|ethiopia|nigeria|drc|kenya|chad|cameroon|zimbabwe|mozambique|burundi|south.sudan/.test(title + countryLower)) tags.push('africa');
      if (/gaza|yemen|syria|lebanon|middle.east/.test(title + countryLower)) tags.push('middleeast');
      if (/afghanistan|myanmar|tajikistan|asia/.test(title + countryLower)) tags.push('asia');
      if (tags.length === 0) tags.push('emergency');

      return {
        source,
        title: f.title || 'Untitled Report',
        body: bodyText,
        date: fmtDate,
        tags,
        url: f.url || ('https://reliefweb.int/updates?search=' + encodeURIComponent(country))
      };
    }).filter(item => item.title && item.title.length > 10);

    console.log('[NEWS] Successfully fetched ' + items.length + ' articles from ReliefWeb');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: 'live',
        items,
        count: items.length,
        timestamp: new Date().toISOString()
      })
    };

  } catch (err) {
    console.error('[NEWS] ReliefWeb fetch failed:', err.message);
    return {
      statusCode: 200, // Return 200 so frontend handles gracefully
      headers,
      body: JSON.stringify({
        status: 'unavailable',
        items: [],
        message: err.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};
