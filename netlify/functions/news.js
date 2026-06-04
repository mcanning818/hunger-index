exports.config = { timeout: 26 };

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

  // ATTEMPT 1: ReliefWeb v2 JSON API — filter by known org shortnames (returns results reliably)
  try {
    const rwBody = JSON.stringify({
      limit: 20,
      sort: ['date.created:desc'],
      fields: { include: ['title', 'date.created', 'source', 'country', 'body', 'url'] },
      filter: {
        operator: 'OR',
        conditions: [
          { field: 'source.shortname', value: 'WFP' },
          { field: 'source.shortname', value: 'FEWS NET' },
          { field: 'source.shortname', value: 'OCHA' },
          { field: 'source.shortname', value: 'FAO' },
          { field: 'source.shortname', value: 'IPC' }
        ]
      }
    });

    console.log('[NEWS] Appname being used: thehungerindex-TlD3aiDqg3-2026');
    const r = await fetch('https://api.reliefweb.int/v2/reports?appname=thehungerindex-TlD3aiDqg3-2026&limit=20', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'HungerIndex/1.0 (thehungerindex.netlify.app)' },
      body: rwBody,
      signal: AbortSignal.timeout(25000)
    });

    console.log('[NEWS] ReliefWeb response status:', r.status);
    if (!r.ok) throw new Error('ReliefWeb HTTP ' + r.status);
    const data = await r.json();

    const items = (data.data || []).map(item => {
      const f = item.fields || {};
      const country = (f.country || [])[0]?.name || '';
      const source = (f.source || [])[0]?.name || 'ReliefWeb';
      const dateStr = f['date.created'] || '';
      let fmtDate = dateStr;
      try { fmtDate = new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); } catch(_) {}
      const rawBody = (f.body || '').replace(/<[^>]+>/g, '').trim();
      const bodyText = rawBody.slice(0, 200) || 'See full report on ReliefWeb.';
      const title = (f.title || '').toLowerCase();
      const cl = country.toLowerCase();
      const tags = [];
      if (/famine|ipc.5/.test(title)) tags.push('famine');
      if (/emergency|crisis/.test(title)) tags.push('emergency');
      if (/africa|sudan|somalia|ethiopia|nigeria|drc|kenya|chad|zimbabwe|mozambique/.test(title + cl)) tags.push('africa');
      if (/gaza|yemen|syria|lebanon|middle.east/.test(title + cl)) tags.push('middleeast');
      if (/afghanistan|myanmar|asia/.test(title + cl)) tags.push('asia');
      if (tags.length === 0) tags.push('emergency');
      return { source, title: f.title || 'Untitled', body: bodyText, date: fmtDate, tags, url: f.url || 'https://reliefweb.int' };
    }).filter(i => i.title.length > 10);

    if (items.length > 0) {
      console.log('[NEWS] ReliefWeb JSON: ' + items.length + ' articles');
      return { statusCode: 200, headers, body: JSON.stringify({ status: 'live', source: 'reliefweb', items, count: items.length, timestamp: new Date().toISOString() }) };
    }
    throw new Error('ReliefWeb returned 0 items');
  } catch(err) {
    console.warn('[NEWS] ReliefWeb JSON failed (' + err.message + ') — trying RSS');
  }

  // ATTEMPT 2: ReliefWeb RSS — public feed, no auth, always available
  try {
    const rssUrl = 'https://reliefweb.int/updates/rss.xml?primary_country=0&report_type=0&source=1503,1741,1502,6,4592';
    const r = await fetch(rssUrl, {
      headers: { 'Accept': 'application/rss+xml, application/xml, text/xml', 'User-Agent': 'HungerIndex/1.0 (thehungerindex.netlify.app)' },
      signal: AbortSignal.timeout(20000)
    });

    if (!r.ok) throw new Error('RSS HTTP ' + r.status);
    const xml = await r.text();

    // Parse <item> blocks from RSS XML without a DOM parser
    const itemBlocks = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
    const items = itemBlocks.map(block => {
      const get = tag => { const m = block.match(new RegExp('<' + tag + '[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></' + tag + '>|<' + tag + '[^>]*>([^<]*)</' + tag + '>')); return m ? (m[1] || m[2] || '').trim() : ''; };
      const title = get('title');
      const link = get('link') || get('guid');
      const pubDate = get('pubDate');
      const description = get('description').replace(/<[^>]+>/g, '').trim().slice(0, 200) || 'See full report on ReliefWeb.';
      const source = get('dc:source') || get('source') || 'ReliefWeb';
      let fmtDate = pubDate;
      try { fmtDate = new Date(pubDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); } catch(_) {}
      const t = title.toLowerCase();
      const tags = [];
      if (/famine|ipc.5/.test(t)) tags.push('famine');
      if (/emergency|crisis/.test(t)) tags.push('emergency');
      if (/africa|sudan|somalia|ethiopia|nigeria|drc|kenya|chad|zimbabwe|mozambique/.test(t)) tags.push('africa');
      if (/gaza|yemen|syria|lebanon|middle.east/.test(t)) tags.push('middleeast');
      if (/afghanistan|myanmar|asia/.test(t)) tags.push('asia');
      if (tags.length === 0) tags.push('emergency');
      return { source, title, body: description, date: fmtDate, tags, url: link };
    }).filter(i => i.title && i.title.length > 10).slice(0, 20);

    if (items.length > 0) {
      console.log('[NEWS] ReliefWeb RSS: ' + items.length + ' articles');
      return { statusCode: 200, headers, body: JSON.stringify({ status: 'live', source: 'reliefweb-rss', items, count: items.length, timestamp: new Date().toISOString() }) };
    }
    throw new Error('RSS returned 0 items');
  } catch(err) {
    console.warn('[NEWS] ReliefWeb RSS failed: ' + err.message);
  }

  // ATTEMPT 3: Static fallback
  console.warn('[NEWS] All sources failed — frontend will use static NEWS_DATA');
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ status: 'unavailable', items: [], timestamp: new Date().toISOString() })
  };
};
