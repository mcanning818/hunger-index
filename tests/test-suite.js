// THE HUNGER INDEX — ROUTINE TEST SUITE
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = (() => {
  const p = path.join(ROOT, 'index.html');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
})();
const serverJs = (() => {
  const p = path.join(ROOT, 'server.js');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
})();

let passed = 0, failed = 0;

function run(category, tests) {
  console.log(`\n[${category}]`);
  for (const [name, fn] of Object.entries(tests)) {
    try {
      const ok = fn();
      if (ok) { console.log(`  ✅ ${name}`); passed++; }
      else     { console.error(`  ❌ ${name}`); failed++; }
    } catch (e) {
      console.error(`  ❌ ${name}\n     ${e.message}`); failed++;
    }
  }
}

function count(str, needle) {
  let n = 0, pos = 0;
  while ((pos = str.indexOf(needle, pos)) !== -1) { n++; pos += needle.length; }
  return n;
}

function hasId(id) { return html.includes(`id="${id}"`); }
function hasFn(name) { return html.includes(`function ${name}(`); }

console.log('🧪 THE HUNGER INDEX — ROUTINE TESTS\n');

// ─── Category 1: File Structure ───────────────────────────────────────────────
run('Category 1 — File Structure', {
  'index.html exists':    () => fs.existsSync(path.join(ROOT, 'index.html')),
  'package.json exists':  () => fs.existsSync(path.join(ROOT, 'package.json')),
  'tests/ directory exists': () => fs.existsSync(path.join(ROOT, 'tests')),
  'index.html is >40 KB': () => html.length > 40_000,
});

// ─── Category 2: Data Integrity ───────────────────────────────────────────────
const newCountries = ['Cameroon','Chad','Kenya','Burkina Faso','Lebanon','Colombia','Mozambique','Tajikistan','Guatemala','Burundi'];
const newCountryTests = {};
for (const c of newCountries) newCountryTests[`new country: ${c}`] = () => html.includes(`country:"${c}"`);

run('Category 2 — Data Integrity', {
  'CRISIS_DATA has 24 entries':      () => count(html, '{country:') === 24,
  'NEWS_DATA has 8+ entries':        () => count(html, '{source:') >= 8,
  'Exactly 2 IPC Phase 5 countries': () => count(html, 'ipc:5') === 2,
  'At least 5 IPC Phase 4 countries':() => count(html, 'ipc:4') >= 5,
  'All 24 ghiScore fields present':  () => count(html, 'ghiScore:') === 24,
  'At least 4 null ghiScores':       () => count(html, 'ghiScore:null') >= 4,
  'All populations use M suffix':    () => count(html, 'population:"') === count(html, 'M"'),
  'ipcColors defined for phases 1-5':() => [1,2,3,4,5].every(i => html.includes(`${i}:'#`)),
  ...newCountryTests,
});

// ─── Category 3: HTML Element IDs ─────────────────────────────────────────────
run('Category 3 — HTML Element IDs', {
  // Pages
  'page: home':       () => hasId('page-home'),
  'page: map':        () => hasId('page-map'),
  'page: trends':     () => hasId('page-trends'),
  'page: news':       () => hasId('page-news'),
  'page: profiles':   () => hasId('page-profiles'),
  'page: about':      () => hasId('page-about'),
  // Nav
  'nav: home':        () => hasId('nav-home'),
  'nav: map':         () => hasId('nav-map'),
  'nav: trends':      () => hasId('nav-trends'),
  'nav: news':        () => hasId('nav-news'),
  'nav: profiles':    () => hasId('nav-profiles'),
  'nav: about':       () => hasId('nav-about'),
  // Hero stats
  'stat1':            () => hasId('stat1'),
  'stat2':            () => hasId('stat2'),
  'stat3':            () => hasId('stat3'),
  'stat4':            () => hasId('stat4'),
  // Map sidebar (new)
  'mapSearch':        () => hasId('mapSearch'),
  'mapCountriesShown':() => hasId('mapCountriesShown'),
  'mapCrisesCount':   () => hasId('mapCrisesCount'),
  'mapEmergencyCount':() => hasId('mapEmergencyCount'),
  'dataLastUpdated':  () => hasId('dataLastUpdated'),
  'mapPanel':         () => hasId('mapPanel'),
  // Charts
  'chartTimeline':    () => hasId('chartTimeline'),
  'chartRegions':     () => hasId('chartRegions'),
  'chartIPC':         () => hasId('chartIPC'),
  'chartCountries':   () => hasId('chartCountries'),
  // Other
  'tickerTrack':      () => hasId('tickerTrack'),
  'feedbackForm':     () => hasId('feedbackForm'),
  'loadingOverlay':   () => hasId('loadingOverlay'),
  'heroNum':          () => hasId('heroNum'),
  'liveTime':         () => hasId('liveTime'),
  'updateFlash':      () => hasId('updateFlash'),
  'newsFeed':         () => hasId('newsFeed'),
  'countryListItems': () => hasId('countryListItems'),
  'profileDetail':    () => hasId('profileDetail'),
});

// ─── Category 4: JavaScript Functions ─────────────────────────────────────────
run('Category 4 — JavaScript Functions', {
  // Core
  'navigate':            () => hasFn('navigate'),
  'initHome':            () => hasFn('initHome'),
  'initMap':             () => hasFn('initMap'),
  'initCharts':          () => hasFn('initCharts'),
  // Data render
  'renderCrisisCards':   () => hasFn('renderCrisisCards'),
  'renderSidebarNews':   () => hasFn('renderSidebarNews'),
  'renderNews':          () => hasFn('renderNews'),
  'filterNews':          () => hasFn('filterNews'),
  'renderCountryList':   () => hasFn('renderCountryList'),
  'selectCountry':       () => hasFn('selectCountry'),
  'filterCountries':     () => hasFn('filterCountries'),
  // Live
  'initTicker':          () => hasFn('initTicker'),
  'startLiveClock':      () => hasFn('startLiveClock'),
  'startDataRefresh':    () => hasFn('startDataRefresh'),
  // New map features
  'filterMapByPhase':    () => hasFn('filterMapByPhase'),
  'searchMapCountry':    () => hasFn('searchMapCountry'),
  'updateMapStats':      () => hasFn('updateMapStats'),
  'updateDataTimestamp': () => hasFn('updateDataTimestamp'),
  'fetchLiveHungerData': () => hasFn('fetchLiveHungerData'),
  'startLiveDataRefresh':() => hasFn('startLiveDataRefresh'),
  // Feedback
  'toggleFeedbackModal': () => hasFn('toggleFeedbackModal'),
});

// ─── Category 5: New Feature Presence ─────────────────────────────────────────
run('Category 5 — New Feature Presence', {
  'mapMarkers array declared':              () => html.includes('mapMarkers=[]') || html.includes('mapMarkers = []'),
  '4 phase-filter buttons':                () => count(html, 'phase-filter') >= 4,
  'mapSearch input present':               () => html.includes('id="mapSearch"'),
  'Globe.gl autoRotate enabled':            () => html.includes('autoRotate'),
  'pulse ring for IPC 4/5':               () => html.includes('d.ipc>=4'),
  'WFP HungerMap API URL':                () => html.includes('api.hungermapdata.org') || serverJs.includes('api.hungermapdata.org'),
  'startLiveDataRefresh called on load':   () => html.includes('startLiveDataRefresh()'),
  'updateMapStats called in initMap':      () => html.includes('updateMapStats()'),
  'updateDataTimestamp called in initMap': () => html.includes('updateDataTimestamp()'),
  'Anime.js CDN loaded':                  () => html.includes('animejs'),
  'Chart.js CDN loaded':                  () => html.includes('chart.umd.min.js'),
  'Globe.gl CDN loaded':                  () => html.includes('globe.gl'),
});

// ─── Category 6: Coords Coverage ──────────────────────────────────────────────
run('Category 6 — Coords Coverage', {
  'coords object defined in initMap': () => html.includes("const coords={"),
  'all 24 CRISIS_DATA countries have coords': () => {
    const countries = [...html.matchAll(/\{country:"([^"]+)"/g)].map(m => m[1]);
    const coordsBlock = html.match(/const coords=\{([\s\S]*?)\};/);
    if (!coordsBlock) return false;
    const cb = coordsBlock[1];
    return countries.every(c => cb.includes(`'${c}'`));
  },
  'WORLD_COUNTRIES defined for universal search': () => {
    return html.includes('const WORLD_COUNTRIES=[') && html.includes('selectMapCountry(');
  },
});

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`📊 Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('🎉 All checks passed — dashboard verified!\n');
  console.log('🌐 Running at: http://localhost:3000\n');
} else {
  console.log(`\n⚠️  ${failed} check(s) failed — review output above.\n`);
  process.exit(1);
}
