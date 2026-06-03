// Netlify Function: IPC API proxy
// Official IPC classifications, population per phase, projections, area breakdowns
// IPC API base URL: https://api.ipcinfo.org/

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const API_KEY = process.env.IPC_API_KEY;
  if (!API_KEY) {
    console.warn('IPC_API_KEY not configured — returning empty');
    return { statusCode: 200, headers, body: JSON.stringify({ status: 'unavailable', data: null }) };
  }

  const { iso3 } = event.queryStringParameters || {};

  try {
    const url = iso3
      ? `https://api.ipcinfo.org/country?country=${iso3.toUpperCase()}&format=json&key=${API_KEY}`
      : `https://api.ipcinfo.org/country?format=json&key=${API_KEY}`;

    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`IPC API returned HTTP ${r.status}`);
    const data = await r.json();

    console.log(`IPC API success for ${iso3 || 'global'}`);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: 'live', iso3: iso3 || 'all', data, timestamp: new Date().toISOString() })
    };
  } catch (err) {
    console.warn('IPC API failed:', err.message);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: 'unavailable', error: err.message, data: null })
    };
  }
};
