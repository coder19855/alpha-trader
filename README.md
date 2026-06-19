# Alpha Trader

Alpha Trader is a real-time Indian index-options trading cockpit built on the [Fyers API v3](https://myapi.fyers.in/docsv3). It combines price-action analysis, option-flow gauges, live position monitoring, session replay, and a benchmark backtest engine — all in a single Nx monorepo with a Fastify backend and an Angular web app.

**Bull · Bear · Benchmark**

---

## Features

### Live Deck (`/live`)

Real-time trading dashboard streamed over Server-Sent Events (SSE). Tabs:

| Tab | Description |
|-----|-------------|
| **Signal** | Current action, bias, conviction score, entry threshold, and market regime |
| **Components** | Option-flow and price-action gauge breakdown |
| **Veto** | Chart-structure veto timeline and breakup detail |
| **Strategy** | Trade guidance, recommended strategies, and risk notes |
| **Charts** | Spot price series with signal/trade/flip markers |
| **Events** | Session event log (signals, flips, vetoes) |
| **Positions** | Open index-option legs with live LTP and management advice |
| **Settings** | Trading style, chart veto mode, and auto-exit controls |

Additional live-deck capabilities:

- **Conviction alerts** — toast notifications and optional sounds on signal or conviction changes
- **Auto-exit panel** — configure server-side exit rules for watched positions
- **Market regime** — volatility and trend context for the active symbol
- **Multi-timeframe alignment** — shows how many timeframes agree with the current bias

### Replay Deck (`/replay`)

Replays a past NSE/BSE session day using historical candles and the same analysis pipeline as the live deck. Useful for post-market review and studying signal behaviour without live ticks.

### Benchmark (`/benchmark`)

PA-only backtest engine that replays historical sessions and simulates trades under configurable exit and position policies.

- Matrix runs across exit policies (RR ladder, chandelier trail, flip-exit, and more) and position policies (flat vs scale-ladder)
- Async job queue with live status polling
- Summary, detail, insight, and compare views in the UI
- Excel export (`.xlsx`) of full report data
- Run history persisted in browser local storage

### Open Positions

- REST snapshot at `GET /api/open-positions`
- Live SSE stream at `GET /api/open-positions/stream`
- Management advice computed from current price-action decision vs held direction
- Fyers order and market WebSocket streams for low-latency LTP updates (configurable)

### Auto-Exit

When enabled, the server can place **MARKET sell orders** to square off watched index-option legs once benchmark exit rules confirm (with configurable retest count, signal-flip exit, exit policy, and position policy). Preferences persist in MongoDB when available.

### Authentication

- Fyers OAuth 2.0 flow — one server-side access token (~24 h TTL)
- Tokens stored in MongoDB and reused across restarts
- Web session cookie for browser login continuity
- Token status check and logout endpoints

### Supported Indices

NSE: Nifty 50, Nifty Bank, Fin Nifty, Midcap Select, Nifty Next 50  
BSE: Sensex, Bankex

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Monorepo | [Nx](https://nx.dev) 23 |
| API server | [Fastify](https://fastify.dev) 5 (Node.js) |
| Web app | [Angular](https://angular.dev) 20, Angular Material, NgRx |
| Charts | [lightweight-charts](https://tradingview.github.io/lightweight-charts/) |
| Broker | [fyers-api-v3](https://www.npmjs.com/package/fyers-api-v3) |
| Database | MongoDB (access tokens, session preferences) |
| Analysis | Custom price-action engine + [technicalindicators](https://www.npmjs.com/package/technicalindicators) |

---

## Project Structure

```
alpha-trader/
├── apps/
│   ├── alpha-trader-server/     # Fastify API — routes, plugins, OAuth callback
│   └── alpha-trader-web/        # Angular SPA — live deck, replay, benchmark
└── libs/server/
    ├── analysis/                # Price-action, technical analysis, exit policies
    ├── auth/                    # Fyers + MongoDB plugins
    ├── benchmark/               # Backtest runner, jobs, Excel export
    ├── deck/                    # Live/replay deck payloads, SSE stream hub
    ├── market-data/             # Candles, option chain, Fyers WebSocket streams
    ├── position/                # Open positions, management advice, auto-exit guard
    ├── preferences/             # Settings, auto-exit, web session state
    ├── shared/                  # Types, constants, symbol master, utilities
    └── stream/                  # Open-positions SSE hub
```

---

## Prerequisites

- **Node.js** 22+ (see `@types/node` in root `package.json`)
- **npm** (workspaces enabled)
- **MongoDB** 6+ running locally or remotely
- **Fyers trading account** with API app credentials ([Fyers API dashboard](https://myapi.fyers.in/dashboard/))

---

## Setup

### 1. Clone and install

```sh
git clone <repository-url>
cd alpha-trader
npm install
```

### 2. Configure Fyers API app

In the Fyers developer dashboard, create an app and set the redirect URL to:

```
http://localhost:3000/api/access-token
```

(Use your production server URL in deployment.)

### 3. Environment variables

Create a `.env` file in the workspace root (loaded automatically via `dotenv`):

```env
# Required
FYERS_API_KEY=<your-fyers-app-id>
FYERS_API_SECRET=<your-fyers-app-secret>
FYERS_REDIRECT_URL=http://localhost:3000/api/access-token
MONGODB_URL=mongodb://127.0.0.1:27017/alpha-trader

# Local development (web app + CORS)
WEB_APP_URL=http://localhost:4200
CORS_ORIGIN=http://localhost:4200

# Optional — server bind
HOST=0.0.0.0
PORT=3000
```

| Variable | Required | Description |
|----------|----------|-------------|
| `FYERS_API_KEY` | Yes | Fyers app ID |
| `FYERS_API_SECRET` | Yes | Fyers app secret |
| `FYERS_REDIRECT_URL` | Yes | OAuth redirect — must match Fyers dashboard |
| `MONGODB_URL` | Yes | MongoDB connection string for token and preference persistence |
| `WEB_APP_URL` | Dev | Angular app origin (post-login redirects) |
| `CORS_ORIGIN` | Dev | Comma-separated allowed origins for CORS |
| `WEB_SESSION_SECRET` | No | Cookie signing secret (falls back to `FYERS_API_SECRET`) |
| `HOST` | No | Server bind address (default `0.0.0.0`) |
| `PORT` | No | Server port (default `3000`) |

#### Optional tuning

| Variable | Default | Description |
|----------|---------|-------------|
| `ALPHA_WATCH_SYMBOLS` | all indices | Comma-separated symbols to watch for auto-exit |
| `FYERS_WS_ENABLED` | `true` (non-test) | Enable Fyers market data WebSocket |
| `FYERS_ORDER_WS_ENABLED` | `true` (non-test) | Enable Fyers order update WebSocket |
| `FYERS_WS_LITE_MODE` | `true` | Reduced WS subscription footprint |
| `AUTO_EXIT_POLL_INTERVAL_MS` | — | Auto-exit polling interval |
| `BENCHMARK_FLIP_POLL_MINUTES` | `15` | Benchmark flip-exit poll interval |
| `BENCHMARK_SIGNAL_INTERVAL_MINUTES` | style-dependent | Signal sampling interval for benchmarks |
| `OPEN_POSITIONS_CACHE_TTL_MS` | — | REST position cache TTL |
| `CANDLE_CACHE_TTL_5M_MS` / `CANDLE_CACHE_TTL_15M_MS` | — | Candle cache TTLs |

### 4. Start MongoDB

```sh
# macOS (Homebrew)
brew services start mongodb-community

# Or Docker
docker run -d -p 27017:27017 --name alpha-trader-mongo mongo:7
```

---

## Running

### Development (recommended)

Run the API server and Angular dev server in **two terminals**. The web app proxies `/api` requests to the backend via `apps/alpha-trader-web/proxy.conf.json`.

**Terminal 1 — API server (port 3000):**

```sh
npm run serve
```

**Terminal 2 — Web app (port 4200):**

```sh
npm run serve:web
```

Open [http://localhost:4200](http://localhost:4200), click **Connect Fyers**, complete OAuth, and you are redirected back to the app.

Equivalent Nx commands:

```sh
npx nx serve @alpha-trader/alpha-trader-server
npx nx serve alpha-trader-web
```

### Production build

```sh
# Build both apps
npm run build

# Or individually
npm run build:server   # → apps/alpha-trader-server/dist
npm run build:web      # → dist/apps/alpha-trader-web
```

Run the compiled server:

```sh
node apps/alpha-trader-server/dist/main.js
```

When `dist/apps/alpha-trader-web/browser` exists (after `npm run build`), the server automatically serves the Angular app from the same origin. Set `SERVE_WEB_APP=true` to force this in production.

```sh
SERVE_WEB_APP=true NODE_ENV=production node apps/alpha-trader-server/dist/main.js
```

Set `WEB_APP_URL` and `CORS_ORIGIN` to your public URL (e.g. `https://alpha-trader.onrender.com`).

### Tests

```sh
npm test
```

Runs Jest unit tests across server libraries and the API app.

### Dependency graph

```sh
npx nx graph
```

---

## API Reference

Base URL: `http://localhost:3000` (development)

### Auth & session

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api` | API health / version |
| `GET` | `/api/login` | Check token status; returns `{ hasActiveToken }` or `{ redirectUrl }` |
| `GET` | `/api/login/browser` | Browser OAuth redirect (sets session cookie on success) |
| `GET` | `/api/access-token` | Fyers OAuth callback — exchanges `auth_code` for access token |
| `GET` | `/api/token-status` | `{ isTokenValid }` |
| `GET` | `/api/logout` | Revoke Fyers session and clear stored token |
| `GET` | `/api/web/session` | Web app session snapshot (settings, token state) |

### Deck

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/deck/stream` | SSE live deck ticks (`?symbol=&style=`) |
| `GET` | `/api/deck/live` | One-shot live payload (`?symbol=&style=&scope=`) |
| `GET` | `/api/deck/replay` | Replay session payload (`?symbol=&style=&date=`) |
| `GET` | `/api/deck/replay-trades` | Replay trade list (`?symbol=&style=&date=YYYY-MM-DD`) |
| `GET` | `/api/deck/settings` | Current deck settings |
| `PATCH` | `/api/deck/settings` | Update trading style / veto mode |
| `GET` | `/api/deck/auto-exit` | Auto-exit preference snapshot |
| `PATCH` | `/api/deck/auto-exit` | Update auto-exit preferences |
| `POST` | `/api/deck/veto` | Quick veto mode toggle |

### Positions

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/open-positions` | Open index-option positions + management advice |
| `GET` | `/api/open-positions/stream` | SSE position updates (`?symbol=&tradingStyle=`) |

### Benchmark

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/benchmark/options` | Available config options and limits |
| `POST` | `/api/benchmark/start` | Start async benchmark job |
| `GET` | `/api/benchmark/status` | Poll job status (`?jobId=`) |
| `GET` | `/api/benchmark/report` | Fetch completed report (`?reportId=`) |
| `GET` | `/api/benchmark/export` | Download Excel report (`?reportId=`) |

### Settings & symbols

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/settings` | Global settings snapshot |
| `PATCH` | `/api/settings` | Update global settings |
| `GET` | `/api/auto-exit` | Auto-exit preferences (alias) |
| `PATCH` | `/api/auto-exit` | Update auto-exit preferences (alias) |
| `GET` | `/api/symbols/option-indices` | Supported index symbols (`?exchange=NSE\|BSE`) |

### Trading styles

| Style | Primary timeframe | Use case |
|-------|-------------------|----------|
| `INTRADAY` | 15m | Default session trading |
| `SCALPER` | 5m | Shorter holding periods |
| `POSITIONAL` | 1h | Swing-style bias |

### Veto modes

| Mode | Behaviour |
|------|-----------|
| `strict` | Chart structure strongly blocks entries |
| `relaxed` | Softer veto thresholds |
| `off` | Veto disabled |

---

## Architecture Overview

```mermaid
flowchart LR
  subgraph browser [Angular Web App]
    Live[Live Deck]
    Replay[Replay Deck]
    Bench[Benchmark]
  end

  subgraph server [Fastify API]
    Routes[Routes]
    DeckHub[Deck Stream Hub]
    PosHub[Positions Stream Hub]
  end

  subgraph libs [Server Libraries]
    Analysis[analysis]
    MarketData[market-data]
    Position[position]
    BenchmarkLib[benchmark]
  end

  subgraph external [External]
    Fyers[Fyers API v3]
    Mongo[(MongoDB)]
  end

  browser -->|REST + SSE| Routes
  Routes --> DeckHub
  Routes --> PosHub
  Routes --> libs
  libs --> Fyers
  libs --> Mongo
```

On startup, the server bootstraps open positions for all configured indices, connects Fyers WebSocket streams (when enabled), and begins streaming deck ticks to connected clients during market hours (NSE session).

---

## Deploy on Render

Alpha Trader runs as a **single Render Web Service** that serves both the API and the Angular app from one URL. This is required because the web app calls `/api` on the same origin and the Fyers OAuth callback must hit your server.

### Architecture on Render

```
Browser  →  https://your-app.onrender.com
              ├── /api/*     → Fastify API + SSE streams
              └── /*         → Angular SPA (static files)
MongoDB Atlas  ←  MONGODB_URL (external, required)
Fyers API      ←  OAuth + market data
```

### Step 1 — MongoDB Atlas (required)

Render cannot reach a localhost database. Use [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) free tier:

1. Create a free M0 cluster.
2. **Database Access** → add a database user (username + password).
3. **Network Access** → allow `0.0.0.0/0` (or Render egress IPs if you restrict).
4. **Connect** → choose **Drivers** → copy the connection string.
5. Replace `<password>` and set the database name, e.g.:

```
mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/alpha-trader?retryWrites=true&w=majority
```

### Step 2 — Fyers API app

In the [Fyers API dashboard](https://myapi.fyers.in/dashboard/):

1. Create or open your app.
2. Set the redirect URL to your Render URL (set this **after** first deploy, or use your planned URL):

```
https://your-app.onrender.com/api/access-token
```

3. Note the **App ID** (`FYERS_API_KEY`) and **Secret** (`FYERS_API_SECRET`).

### Step 3 — Create the Render Web Service

**Option A — Blueprint (recommended)**

1. Push this repo to GitHub/GitLab.
2. In [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**.
3. Connect the repo — Render reads `render.yaml` at the repo root.
4. Fill in secret env vars when prompted (see Step 4).

**Option B — Manual Web Service**

1. **New** → **Web Service** → connect your repo.
2. Configure:

| Setting | Value |
|---------|-------|
| **Runtime** | Node |
| **Build Command** | `npm install --legacy-peer-deps && npm run build` |
| **Start Command** | `NODE_ENV=production node apps/alpha-trader-server/dist/main.js` |
| **Health Check Path** | `/api` |

3. Choose a plan (Free tier works; service sleeps after ~15 min idle and cold-starts on next visit).

### Step 4 — Environment variables

In Render → your service → **Environment**, add:

#### Required

| Variable | Example | Description |
|----------|---------|-------------|
| `FYERS_API_KEY` | `XXXXXX-100` | Fyers app ID |
| `FYERS_API_SECRET` | `your-secret` | Fyers app secret |
| `FYERS_REDIRECT_URL` | `https://your-app.onrender.com/api/access-token` | Must match Fyers dashboard exactly |
| `MONGODB_URL` | `mongodb+srv://...` | MongoDB Atlas connection string |
| `WEB_APP_URL` | `https://your-app.onrender.com` | Public app URL (no trailing slash) |
| `CORS_ORIGIN` | `https://your-app.onrender.com` | Same as `WEB_APP_URL` for single-origin deploy |
| `SERVE_WEB_APP` | `true` | Serve Angular build from the same service |
| `NODE_ENV` | `production` | Production mode |
| `NODE_VERSION` | `22` | Node.js version (Render native env) |

#### Recommended

| Variable | Example | Description |
|----------|---------|-------------|
| `WEB_SESSION_SECRET` | long random string | Cookie signing secret (generate with `openssl rand -hex 32`) |

#### Optional (Render sets automatically)

| Variable | Description |
|----------|-------------|
| `PORT` | Injected by Render — do not override unless needed |
| `RENDER` | Set to `true` on Render — used to detect cloud deploy |

#### Optional tuning

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Bind address |
| `WEB_DIST_PATH` | auto-detected | Override path to Angular `browser` output |
| `FYERS_WS_ENABLED` | `true` | Fyers market data WebSocket |
| `FYERS_ORDER_WS_ENABLED` | `true` | Fyers order WebSocket |
| `FYERS_WS_LITE_MODE` | `true` | Reduced WS footprint |
| `ALPHA_WATCH_SYMBOLS` | all indices | Comma-separated symbols for auto-exit watch |
| `AUTO_EXIT_POLL_INTERVAL_MS` | — | Auto-exit poll interval |
| `BENCHMARK_FLIP_POLL_MINUTES` | `15` | Benchmark flip-exit poll |
| `OPEN_POSITIONS_CACHE_TTL_MS` | — | Position REST cache TTL |

**Copy-paste template** (replace placeholders):

```env
FYERS_API_KEY=<fyers-app-id>
FYERS_API_SECRET=<fyers-secret>
FYERS_REDIRECT_URL=https://<your-service>.onrender.com/api/access-token
MONGODB_URL=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/alpha-trader?retryWrites=true&w=majority
WEB_APP_URL=https://<your-service>.onrender.com
CORS_ORIGIN=https://<your-service>.onrender.com
WEB_SESSION_SECRET=<random-32-byte-hex>
SERVE_WEB_APP=true
NODE_ENV=production
NODE_VERSION=22
```

### Step 5 — Deploy

1. Click **Deploy** (or push to the connected branch).
2. Wait for build: `npm install` → `nx build` (server + web).
3. Open `https://<your-service>.onrender.com`.
4. Go to **Login** → **Connect Fyers** → complete OAuth.
5. Confirm `/api/token-status` returns `{ "isTokenValid": true }`.

### Step 6 — Post-deploy checks

| Check | Expected |
|-------|----------|
| `GET /api` | `{ "message": "Alpha Trader API", ... }` |
| App home | Angular shell loads (redirects to `/live/signal`) |
| Fyers login | Redirect back to app after OAuth |
| Live deck SSE | Stream connects during market hours |
| Render logs | `MongoDB connected` and `Serving Angular web app from dist` |

### Render notes

- **Free tier**: Service spins down when idle; first request after sleep takes 30–60s. SSE streams disconnect when the instance sleeps.
- **Paid tier**: Keeps the instance warm — better for live deck during market hours.
- **HTTPS**: Render provides TLS automatically; session cookies use `Secure` in production.
- **Logs**: Dashboard → **Logs** for build errors, Mongo connection, and Fyers auth issues.
- **Custom domain**: Add under **Settings** → **Custom Domains**, then update `WEB_APP_URL`, `CORS_ORIGIN`, and `FYERS_REDIRECT_URL`.

### Render troubleshooting

| Problem | Fix |
|---------|-----|
| Build fails on `npm install` | Build command must include `--legacy-peer-deps` |
| `MongoDB unavailable` in logs | Use Atlas `mongodb+srv://` URL, not `localhost` |
| OAuth redirect mismatch | `FYERS_REDIRECT_URL` must exactly match Fyers dashboard |
| Blank page, API works | Confirm `npm run build` produced `dist/apps/alpha-trader-web/browser` and `SERVE_WEB_APP=true` |
| CORS errors | Set `CORS_ORIGIN` to your exact Render URL (https, no trailing slash) |
| Token not persisted | Check Atlas user/password and network access `0.0.0.0/0` |
| Cold start timeout | Upgrade plan or use a cron ping service to keep instance warm |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Fyers session expired` on deck/benchmark | Re-login via `/login` or `Connect Fyers` |
| Token saved but app still fails | Verify MongoDB is running and `MONGODB_URL` is correct |
| CORS errors from web app | Set `CORS_ORIGIN=http://localhost:4200` and restart the server |
| OAuth redirect mismatch | Ensure `FYERS_REDIRECT_URL` exactly matches the Fyers dashboard entry |
| Live stream shows "Market closed" | NSE/BSE session is outside trading hours — use Replay or Benchmark |
| Web app API calls fail | Confirm the server is on port 3000 and `npm run serve:web` proxy is active |

---

## License

MIT