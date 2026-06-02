// Netlify Function: WFP HungerMap proxy
// Replaces the /api/wfp route from server.js
// Called via /.netlify/functions/wfp (or /api/wfp via redirect in netlify.toml)

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Try WFP HungerMap API endpoints in order
  const endpoints = [
    'https://api.wfp.org/hungermap/latest',
    'https://api.hungermapdata.org/v2/info/country',
    'https://api.hungermapdata.org/v1/info/country',
  ];

  for (const url of endpoints) {
    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'HungerIndex/1.0 (thehungerindex.netlify.app)'
        },
        signal: AbortSignal.timeout(8000)
      });

      if (!response.ok) {
        console.log(`WFP endpoint ${url} returned ${response.status}`);
        continue;
      }

      const data = await response.json();
      console.log(`WFP: successfully fetched from ${url}`);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status: 'live',
          source: url,
          data: data,
          timestamp: new Date().toISOString()
        })
      };
    } catch (err) {
      console.log(`WFP endpoint ${url} failed:`, err.message);
      continue;
    }
  }

  // All endpoints failed — return unavailable status
  // The frontend will fall back to static CRISIS_DATA
  return {
    statusCode: 200, // Return 200 so frontend handles gracefully
    headers,
    body: JSON.stringify({
      status: 'unavailable',
      message: 'WFP API temporarily unavailable',
      timestamp: new Date().toISOString()
    })
  };
};
