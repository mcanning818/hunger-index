exports.config = { timeout: 26 };

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const appname = 'thehungerindex-TlD3aiDqg3-2026';

  const {
    offset = '0',
    limit = '20',
    country = '',
    format = '',
    dateFrom = '',
  } = event.queryStringParameters || {};

  const conditions = [];

  conditions.push({
    field: 'source.shortname',
    value: ['WFP', 'OCHA', 'FAO', 'FEWS NET', 'IPC', 'MSF', 'IRC',
            'Save the Children', 'Oxfam', 'UNICEF', 'WHO', 'UNHCR',
            'NRC', 'Mercy Corps', 'ACF', 'WVI', 'ICRC'],
    operator: 'OR'
  });

  if (country && country !== 'all') {
    conditions.push({
      field: 'country.iso3',
      value: [country.toUpperCase()],
      operator: 'OR'
    });
  } else {
    conditions.push({
      field: 'country.iso3',
      value: [
        'SDN','SSD','PSE','YEM','HTI','COD','AFG','ETH','MLI',
        'SOM','MMR','SYR','NGA','ZWE','CMR','TCD','KEN','BFA',
        'LBN','COL','MOZ','TJK','GTM','BDI'
      ],
      operator: 'OR'
    });
  }

  if (format && format !== 'all') {
    conditions.push({
      field: 'format.name',
      value: [format],
      operator: 'OR'
    });
  }

  const sixMonthsAgo = dateFrom || (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return d.toISOString().slice(0, 10);
  })();

  conditions.push({
    field: 'date.created',
    value: { from: sixMonthsAgo },
    operator: 'AND'
  });

  const body = {
    appname,
    limit: Math.min(parseInt(limit) || 20, 50),
    offset: parseInt(offset) || 0,
    sort: ['date.created:desc'],
    fields: {
      include: [
        'title', 'date.created', 'source.shortname', 'source.name',
        'country.name', 'country.iso3', 'format.name',
        'body-html', 'url', 'file'
      ]
    },
    filter: {
      operator: 'AND',
      conditions
    }
  };

  console.log(`[NEWS] offset:${offset} limit:${limit} country:${country||'all'} format:${format||'all'}`);

  try {
    const r = await fetch('https://api.reliefweb.int/v2/reports?appname=' + appname, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    });

    if (!r.ok) throw new Error(`ReliefWeb HTTP ${r.status} — ${await r.text()}`);

    const data = await r.json();
    const articles = (data.data || []).map(item => {
      const f = item.fields || {};
      const rawBody = (f['body-html'] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const excerpt = rawBody.length > 280 ? rawBody.slice(0, 280) + '…' : rawBody;

      return {
        id: item.id,
        title: f.title || 'Untitled',
        excerpt,
        source: (f.source || [{}])[0]?.shortname || 'ReliefWeb',
        sourceFull: (f.source || [{}])[0]?.name || 'ReliefWeb',
        country: (f.country || [{}])[0]?.name || '',
        countryIso3: (f.country || [{}])[0]?.iso3 || '',
        format: (f.format || [{}])[0]?.name || 'News',
        date: (f.date && f.date.created) ? f.date.created.slice(0, 10) : (f['date.created'] ? f['date.created'].slice(0, 10) : ''),
        url: f.url || item.href || '',
      };
    });

    const totalCount = data.totalCount || (data.total && data.total.value) || articles.length;

    console.log(`[NEWS] ${articles.length} articles (total: ${totalCount})`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: 'live',
        source: 'reliefweb',
        articles,
        total: totalCount,
        offset: parseInt(offset),
        limit: parseInt(limit),
        hasMore: parseInt(offset) + articles.length < totalCount,
        timestamp: new Date().toISOString()
      })
    };

  } catch (err) {
    console.warn('[NEWS] ReliefWeb failed:', err.message);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: 'unavailable',
        error: err.message,
        articles: [],
        total: 0,
        hasMore: false,
        timestamp: new Date().toISOString()
      })
    };
  }
};
