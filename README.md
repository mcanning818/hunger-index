# The Hunger Index

A real-time global food security dashboard tracking acute hunger, conflict, displacement, and humanitarian funding across 24 crisis countries.

**Live:** [thehungerindex.netlify.app](https://thehungerindex.netlify.app)

---

## Overview

The Hunger Index aggregates data from nine independent humanitarian, academic, and intergovernmental sources to make food security data accessible to general audiences, journalists, and researchers. Built as an open-source public tool with no affiliation to any UN agency, NGO, or government body.

---

## Features

- **3D Interactive Globe** — NASA Black Marble night imagery via globe.gl, auto-rotating with IPC phase color-coded crisis markers and pulsing rings
- **Live Country Profiles** — Accordion UI with HDX HAPI food security phases, WFP market prices, IPC phase breakdown bars, UNHCR displacement data, World Bank economic indicators, and Global Hunger Index scores
- **Conflict–Hunger Correlation** — Dual-axis trend chart showing ACLED conflict event intensity alongside IPC Phase 3+ population over time, with annotated 90–180 day lag zone
- **Trends Analysis** — 6 interactive charts with country selector chips and multi-country compare mode
- **News & Alerts** — Live humanitarian situation reports via ReliefWeb v2 API with country and content-type filtering and pagination
- **Methodology Page** — Comprehensive write-up covering IPC classification system, Watch List methodology, data source confidence levels, and known limitations
- **Food Security Watch List** — Secondary tier for countries with documented food insecurity outside formal IPC monitoring (Cuba, Venezuela, North Korea, Eritrea, Guatemala, Honduras, Nicaragua)

---

## Data Sources

| Source | Data | Auth | Status |
|--------|------|------|--------|
| [IPC](https://ipcinfo.org) | Official phase classifications, population per phase, projections | API key | ⏳ Pending |
| [HDX HAPI](https://hapi.humdata.org) | Food security phases, market prices, IDPs, conflict events, humanitarian needs | App identifier | ✅ Live |
| [ReliefWeb](https://reliefweb.int) | Situation reports, humanitarian alerts | Appname | ✅ Live |
| [World Bank](https://data.worldbank.org) | GDP per capita, poverty rate, malnutrition, population | None | ✅ Live |
| [UNHCR](https://www.unhcr.org/refugee-statistics) | Refugees, displaced persons by country | None | ✅ Live |
| [ACLED](https://acleddata.com) | Conflict events via HDX HAPI | Via HDX | ✅ Live |
| [FAO FAOSTAT](https://www.fao.org/faostat) | Undernourishment prevalence | None | Static fallback |
| [WFP HungerMap](https://hungermap.wfp.org) | Food consumption scores, coping strategy index | None | Static fallback |
| [Global Hunger Index](https://www.globalhungerindex.org) | Composite hunger scores, 130+ countries | None | ✅ Live (static) |

---

## Tech Stack

- **Frontend:** Single-file HTML — no framework, no build step
- **Globe:** [globe.gl](https://globe.gl) + NASA Black Marble night imagery
- **Charts:** Chart.js 4.4.0
- **Animations:** Anime.js 3.2.1
- **Backend:** Netlify Functions (Node 18, CommonJS)
- **Deployment:** Netlify (auto-deploy from GitHub main branch)
- **APIs:** Proxied through Netlify Functions to handle CORS + auth

---

## Architecture

```
hunger-index-project/
├── index.html                  # Entire frontend — CSS, HTML, JS in one file
├── netlify.toml                # Build config, CSP headers, function redirects
├── netlify/functions/
│   ├── hdx.js                  # HDX HAPI proxy — food security, prices, IDPs, conflict
│   ├── ipc.js                  # IPC API proxy — official phase classifications
│   ├── wfp.js                  # WFP HungerMap proxy
│   └── news.js                 # ReliefWeb proxy with pagination + filtering
└── server.js                   # Local dev server (non-Netlify fallback)
```

### API Proxy Pattern

All external API calls are routed through Netlify Functions to handle CORS restrictions and protect API keys.

```
Browser → /api/hdx?iso3=SDN
→ /.netlify/functions/hdx (Netlify redirect)
→ https://hapi.humdata.org/api/v2/... (server-side, no CORS)
→ { data: { food_security: [...], food_prices: [...] } }
→ Browser
```

### Data Loading Strategy

Data is fetched in parallel batches on page load and cached in memory for the session. HDX data loads in batches of 4 countries with 500ms delays to avoid rate limiting. Charts render after `window.hdxDataReady` is set, preventing empty states from appearing before data arrives.

---

## Local Development

**Prerequisites:** Node.js 18+, Netlify CLI

```bash
# Clone
git clone https://github.com/mcanning818/hunger-index.git
cd hunger-index

# Install Netlify CLI
npm install -g netlify-cli

# Link to Netlify site
netlify login
netlify link

# Add environment variables
echo "HDX_APP_ID=your_encoded_identifier" > .env

# Start local dev server
netlify dev
# → http://localhost:8888
```

**Generate HDX app identifier:**
```bash
echo -n "your-app-name:your-email@domain.com" | base64
```

**Environment variables required:**

| Variable | Purpose | Where to get |
|----------|---------|-------------|
| `HDX_APP_ID` | HDX HAPI authentication | `echo -n "app:email" \| base64` |
| `IPC_API_KEY` | IPC API access | [ipcinfo.org](https://ipcinfo.org) registration |

---

## Deployment

The site auto-deploys to Netlify on every push to `main`:

```bash
git add .
git commit -m "Your message"
git push origin main
# Netlify deploys in ~30 seconds
```

Environment variables are configured in Netlify dashboard → Site configuration → Environment variables.

---

## Author

Built by **Mikah Canning**, student at Tulane University.

Open-source. No affiliation with any UN agency, NGO, or government body. Data displayed is sourced directly from the organizations listed above.
