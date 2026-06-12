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
  const errors = {};
  await Promise.allSettled(
    Object.entries(toFetch).map(async ([key, url]) => {
      try {
        const r = await fetch(url, {
          signal: AbortSignal.timeout(12000),
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'TheHungerIndex/1.0 (thehungerindex.netlify.app; mikahcanning@gmail.com)',
          }
        });
        if (!r.ok) {
          const body = await r.text().catch(() => '');
          console.warn(`HDX ${key} failed: HTTP ${r.status} — ${body.slice(0, 200)}`);
          errors[key] = { status: r.status, body: body.slice(0, 200) };
          return;
        }
        const data = await r.json();
        const topKeys = Object.keys(data);
        console.log(`HDX ${key} for ${iso3}: top-level keys=${JSON.stringify(topKeys)}`);
        results[key] = data.data || data.results || data.items || [];
        console.log(`HDX ${key} for ${iso3}: ${results[key].length} rows`);
      } catch (err) {
        console.warn(`HDX ${key} error:`, err.message);
        errors[key] = { error: err.message };
      }
    })
  );

  // UNHCR: IDPs and Refugees by country of origin (no auth required)
  const unhcrResults=await Promise.allSettled([
    fetch(`https://api.unhcr.org/population/v1/idps/?coo=${iso3}&limit=10&yearFrom=2019`,{headers:{'Accept':'application/json'},signal:AbortSignal.timeout(10000)}).then(r=>r.ok?r.json():null).catch(()=>null),
    fetch(`https://api.unhcr.org/population/v1/refugees/?coo=${iso3}&limit=10&yearFrom=2019`,{headers:{'Accept':'application/json'},signal:AbortSignal.timeout(10000)}).then(r=>r.ok?r.json():null).catch(()=>null),
  ]);
  const unhcrIdps=unhcrResults[0].status==='fulfilled'?unhcrResults[0].value:null;
  const unhcrRefugees=unhcrResults[1].status==='fulfilled'?unhcrResults[1].value:null;
  console.log(`[UNHCR] ${iso3} — IDPs: ${unhcrIdps?.items?.length||0} records, Refugees: ${unhcrRefugees?.items?.length||0} records`);
  results.unhcr_idps=unhcrIdps?.items||[];
  results.unhcr_refugees=unhcrRefugees?.items||[];

  // OCHA FTS: humanitarian response plan funding (no auth required)
  const FTS_COUNTRY_IDS={'SDN':232,'SSD':218,'PSE':171,'YEM':257,'HTI':97,'COD':42,'AFG':1,'ETH':66,'MLI':140,'SOM':213,'MMR':153,'SYR':225,'NGA':164,'ZWE':261,'CMR':30,'TCD':39,'KEN':113,'BFA':24,'LBN':122,'COL':43,'MOZ':152,'TJK':228,'GTM':90,'BDI':26};
  const ftsId=FTS_COUNTRY_IDS[iso3.toUpperCase()];
  if(ftsId){
    try{
      const ftsR=await fetch(`https://api.fts.unocha.org/v2/fts/flow/country/${ftsId}?groupby=plan&year=2024,2025`,{headers:{'Accept':'application/json'},signal:AbortSignal.timeout(10000)});
      if(ftsR.ok){
        const ftsData=await ftsR.json();
        results.fts_funding=ftsData?.data?.report3?.fundingTotals?.objects?.[0]?.singleFundingObjects||[];
        console.log(`[FTS] ${iso3} — ${results.fts_funding.length} funding records`);
      }else{results.fts_funding=[];}
    }catch(err){console.warn(`[FTS] ${iso3} failed:`,err.message);results.fts_funding=[];}
  }else{results.fts_funding=[];}

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ iso3: iso3.toUpperCase(), data: results, errors, timestamp: new Date().toISOString() })
  };
};
