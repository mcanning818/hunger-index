// Netlify Function: HDX HAPI proxy
// Fetches food security, food prices, poverty, IDP, refugee, and humanitarian needs data
// HDX HAPI base URL: https://hapi.humdata.org/api/v1/

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const APP_ID = process.env.HDX_APP_ID;
  if (!APP_ID) return { statusCode: 500, headers, body: JSON.stringify({ error: 'HDX_APP_ID not configured' }) };

  const { iso3, type } = event.queryStringParameters || {};
  if (!iso3) return { statusCode: 400, headers, body: JSON.stringify({ error: 'iso3 parameter required' }) };

  const BASE = 'https://hapi.humdata.org/api/v2';
  const params = `location_code=${iso3.toUpperCase()}&output_format=json&limit=1000&app_identifier=${APP_ID}`;

  const endpoints = {
    food_security: `${BASE}/food-security-nutrition-poverty/food-security?${params}&admin_level=0`,
    food_prices: `${BASE}/food-security-nutrition-poverty/food-prices-market-monitor?${params}&output_format=json&limit=100`,
    poverty: `${BASE}/food-security-nutrition-poverty/poverty-rate?${params}`,
    idps: `${BASE}/affected-people/idps?${params}`,
    refugees: `${BASE}/affected-people/refugees-persons-of-concern?${params}`,
    needs: `${BASE}/affected-people/humanitarian-needs?${params}&admin_level=0`,
    conflict: `${BASE}/coordination-context/conflict-event?${params}&limit=1000`,
  };

  const toFetch = type && endpoints[type]
    ? { [type]: endpoints[type] }
    : endpoints;

  const results = {};
  await Promise.allSettled(
    Object.entries(toFetch).map(async ([key, url]) => {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
        if (!r.ok) { console.warn(`HDX ${key} failed: HTTP ${r.status}`); return; }
        const data = await r.json();
        results[key] = data.data || [];
        console.log(`HDX ${key} for ${iso3}: ${results[key].length} rows`);
      } catch (err) {
        console.warn(`HDX ${key} error:`, err.message);
      }
    })
  );

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ iso3: iso3.toUpperCase(), data: results, timestamp: new Date().toISOString() })
  };
};
