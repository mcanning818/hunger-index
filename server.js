// Hunger Index -- local dev server + API proxy
// No npm dependencies required -- Node.js built-ins only
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { execFile } = require('child_process');

const PORT = 3000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript',
  '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml',
};

// Proxy helper -- uses execFile(curl) to bypass AWS WAF JS challenge on reliefweb.int
// Node.js https gets a 202 challenge page; curl does not.
function fetchUrl(targetUrl) {
  return new Promise((resolve, reject) => {
    execFile('curl', ['-s', '--max-time', '10', '-L', targetUrl],
      { maxBuffer: 5 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return reject(new Error(err.message));
        resolve({ status: 200, body: stdout });
      }
    );
  });
}

// RSS parser (no external deps)
function parseRSS(xml) {
  const items = [];
  const blocks = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
  for (const block of blocks) {
    const get = (tag) => {
      const m = block.match(new RegExp('<' + tag + '>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/' + tag + '>'));
      return m ? m[1].trim() : '';
    };
    const title = get('title');
    const link  = get('link') || get('guid');
    const date  = get('pubDate');
    const desc  = get('description')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      // Strip ReliefWeb structured metadata labels embedded in descriptions
      .replace(/\b(?:PRIMARY\s+)?COUNTR(?:Y|IES):[^\n\r]*/gi, '')
      .replace(/\b(?:PRIMARY\s+)?SOURCES?:[^\n\r]*/gi, '')
      .replace(/\bTHEME:[^\n\r]*/gi, '')
      .replace(/\bFORMAT:[^\n\r]*/gi, '')
      .replace(/\bDATE:[^\n\r]*/gi, '')
      .replace(/\bFILE:[^\n\r]*/gi, '')
      .replace(/\s+/g, ' ').trim()
      .slice(0, 200);
    const cats = (block.match(/<category>([\s\S]*?)<\/category>/g) || [])
      .map(c => c.replace(/<\/?category>/g, '').toLowerCase().trim());
    const source = (block.match(/<author>([\s\S]*?)<\/author>/) || [])[1]?.trim()
      || 'ReliefWeb';

    const text = (title + ' ' + cats.join(' ')).toLowerCase();
    const tags = [];
    if (/famine|ipc.5|phase.5/.test(text)) tags.push('famine');
    if (/emergency|ipc.4|phase.4/.test(text)) tags.push('emergency');
    if (/africa|sudan|somalia|ethiopia|nigeria|drc|mali|kenya|chad|cameroon|zimbabwe|mozambique|burundi|south.sudan/.test(text)) tags.push('africa');
    if (/gaza|yemen|syria|lebanon|middle.east/.test(text)) tags.push('middleeast');
    if (/afghanistan|myanmar|tajikistan|asia/.test(text)) tags.push('asia');
    if (!tags.length) tags.push('emergency');

    let fmtDate = date;
    try {
      const d = new Date(date);
      if (!isNaN(d)) fmtDate = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    } catch (_) {}

    if (title) items.push({ source, title, body: desc || 'See full report on ReliefWeb.', date: fmtDate, tags, url: link });
  }
  return items;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };
}

async function handleNews(res) {
  const queries = ['food+insecurity+famine', 'food+insecurity+emergency', 'food+insecurity'];
  let items = [];
  for (const q of queries) {
    try {
      const { body } = await fetchUrl(
        'https://reliefweb.int/updates/rss.xml?query=' + q + '&primary_country=0'
      );
      if (body.includes('<item>')) {
        items = parseRSS(body);
        if (items.length >= 5) break;
      }
    } catch (e) {
      console.warn('  News fetch failed:', e.message);
    }
  }
  res.writeHead(200, corsHeaders());
  res.end(JSON.stringify({ source: 'reliefweb-rss', count: items.length, items }));
}

async function handleWFP(res) {
  // WFP api.hungermapdata.org is returning 500s on all public list endpoints.
  // Return unavailable so the dashboard falls back to static CRISIS_DATA.
  res.writeHead(200, corsHeaders());
  res.end(JSON.stringify({ source: 'wfp-hungermapdata', status: 'unavailable', data: null }));
}

function serveStatic(req, res) {
  const filePath = path.join(ROOT, req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);
  if (!fs.existsSync(filePath)) {
    res.writeHead(404); res.end('Not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new url.URL(req.url, 'http://localhost:' + PORT);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders()); res.end(); return;
  }

  if (pathname === '/api/news') { await handleNews(res).catch(e => { res.writeHead(500); res.end(e.message); }); return; }
  if (pathname === '/api/wfp')  { await handleWFP(res).catch(e  => { res.writeHead(500); res.end(e.message); }); return; }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log('\nHunger Index running at http://localhost:' + PORT);
  console.log('API proxy:');
  console.log('  /api/news  -> ReliefWeb RSS (live)');
  console.log('  /api/wfp   -> WFP HungerMap (fallback to static)\n');
});
