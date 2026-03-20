# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   └── api-server/         # Express API server
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `artifacts/horse-racing-ai` (`@workspace/horse-racing-ai`)

React + Vite frontend for the AI Sports Predictor. Features:
- **Dashboard** — overview stats
- **Horse Racing** — race predictions with pace analysis
- **Sports Center** — NFL, NBA, MLB, NHL, Boxing events with live odds (The Odds API)
- **Sports Picks** — prediction history with AI training feedback
- **Lottery Predictor** — ML-powered lottery number predictions (6 games: Powerball, Mega Millions, Cash4Life, NY Lotto, Take 5, Pick 10)
  - Hot/Cold number analysis (last 30 draws vs all-time)
  - Number Frequency Heatmap (color-coded grid)
  - Prediction Performance Trends with running accuracy
  - Auto-compare predictions against actual results

Key pages: `src/pages/Lottery.tsx`, `src/pages/SportEvents.tsx`, `src/pages/SportsPredictions.tsx`

### Database Schema (`lib/db`)

Tables: tracks, horses, races, race_entries, predictions, sports_events, sports_predictions, lottery_games, lottery_results, lottery_predictions

### Lottery Data Sync (`artifacts/api-server/src/lib/lotterySync.ts`)

Pulls real historical lottery results from the **NY Open Data API** (free, no API key):
- **Powerball**: `data.ny.gov/resource/d6yy-54nr.json` (since 2010)
- **Mega Millions**: `data.ny.gov/resource/5xaw-6ayf.json` (since 2002)
- **Cash4Life**: `data.ny.gov/resource/kwxv-fwze.json` (since 2014)
- **NY Lotto**: `data.ny.gov/resource/6nbc-h7bj.json` (since 2001)
- **Take 5**: `data.ny.gov/resource/dg63-4siq.json` (since 1992, no bonus)
- **Pick 10**: `data.ny.gov/resource/bycu-cw7c.json` (since 1987, no bonus, pick 10 from 80)

Features:
- Auto-syncs on server startup (3s delay) and every 6 hours
- Auto-compare: after sync, compares pending predictions against the immediate next draw's actual results
- Incremental sync — only fetches draws newer than the latest in DB
- Pagination — fetches up to 5,000 records per game (5 pages x 1,000)
- Manual sync via `POST /api/lottery/sync`
- Data status via `GET /api/lottery/data-status`
- Recent results via `GET /api/lottery/results?gameKey=powerball&limit=10`
- Hot/Cold analysis via `GET /api/lottery/hot-cold?gameKey=powerball`
- Prediction trends via `GET /api/lottery/trends?gameKey=powerball`
- Sports accuracy per sport via `GET /api/sports/predictions/accuracy-by-sport`

### ML Engine (`artifacts/api-server/src/lib/lotteryML.ts`)

6-algorithm ML ensemble for lottery predictions:
1. **Weighted Frequency** (25%) — exponential recency weighting
2. **Monte Carlo Simulation** (25%) — 10,000 weighted random simulations
3. **Gap Analysis** (20%) — overdue number detection by interval
4. **Pair Clustering** (15%) — co-occurring number pair analysis
5. **Moving Average Trend** (10%) — short vs long term crossover
6. **Sum Distribution** (5%) — statistical sum range optimization

Prediction modes: hybrid (ML+AI), ml (pure ML), ai (GPT-5.2 only), ml-fallback (when AI fails)

### Sports ML Ensemble (`artifacts/api-server/src/lib/sportsML.ts`)

5-algorithm machine learning ensemble for sports predictions (NFL, NBA, MLB, NHL, soccer, MMA, boxing, etc.):

1. **Team Strength Model (30%)** — Compares power ratings and baseline team quality
2. **Form Momentum (25%)** — Analyzes recent win/loss streaks (last 5 games) and team momentum
3. **Head-to-Head Analysis (20%)** — Historical matchup results from past 3 seasons
4. **Rest & Fatigue (15%)** — Models impact of rest days and travel fatigue
5. **Elo Rating (10%)** — Statistical rating system using Elo formula

For soccer, includes draw probability. Algorithms ensemble-average with their weights, returning:
- Home/away/draw win probabilities
- Projected total score
- Algorithm breakdown with insights
- Confidence levels per algorithm

ML predictions are stored in `analysisJson.mlPrediction` and displayed in the Sports Picks UI alongside AI predictions.

### ML Monitoring & Analytics (`artifacts/api-server/src/lib/mlMonitoring.ts`)

Real-time monitoring system for ML prediction performance and drift detection:

**Database Table:**
- `ml_metrics` — Stores per-algorithm predictions with outcomes for analysis

**Monitoring Metrics:**
- **Overall Accuracy** — % of correct predictions by sport
- **Algorithm Performance** — Individual accuracy for each of the 5 algorithms
- **Confidence Calibration** — How well model confidence aligns with actual accuracy
- **Confidence Distribution** — Breakdown of predictions by confidence range (0-20%, 20-40%, etc.)
- **Accuracy Trends** — Daily accuracy over time (7-day rolling view)
- **Model Drift Detection** — Compares recent accuracy vs historical (threshold: 10% change)

**API Endpoints:**
- `GET /api/sports/ml-monitoring/:sport` — Full metrics for a sport (nfl, nba, mlb, etc.)
- `GET /api/sports/ml-monitoring` — All sports metrics aggregated
- `GET /api/sports/ml-drift/:sport` — Drift detection status

**How It Works:**
1. When prediction created → `recordMLPrediction()` stores each algorithm's output
2. When result recorded → `updateMLMetricsWithResult()` marks outcome as correct/wrong
3. Monitoring endpoints query metrics to calculate accuracy, confidence calibration, trends
4. Drift detection compares last 20 predictions vs prior 20 to flag model degradation

Example response from `/api/sports/ml-monitoring/nfl`:
```json
{
  "sportKey": "nfl",
  "totalPredictions": 45,
  "resolvedPredictions": 32,
  "overallAccuracy": 71.9,
  "avgConfidence": 68.5,
  "calibrationError": 3.4,
  "algorithmStats": [
    {
      "name": "Team Strength Model",
      "accuracy": 75.2,
      "avgConfidence": 72.1,
      "calibration": 3.1
    }
  ],
  "accuracyTrend": [
    { "date": "2026-03-18", "accuracy": 73.5, "count": 8 },
    { "date": "2026-03-19", "accuracy": 68.9, "count": 9 }
  ]
}
```

### Historical Sports Data (`artifacts/api-server/src/lib/historicalSportsSync.ts`)

System to pull and store historical sports game data for ML training and analysis:

**Database Tables:**
- `sports_games` — Completed game results (team names, scores, date, outcome)
- `sports_team_stats` — Aggregated per-team stats per season (W/L/D, power rating, Elo)

**API Endpoints:**
- `POST /api/sports/historical/sync/:sport` — Fetch and store games for a specific sport (nfl, nba, mlb, nhl, ncaaf, ncaab)
- `POST /api/sports/historical/sync-all` — Sync all supported sports in parallel
- `GET /api/sports/historical/games?sport=nfl&team=Kansas City Chiefs&limit=50` — Query stored games
- `GET /api/sports/historical/team-stats?sport=nfl&team=Chiefs` — Query team stats by sport/team/season

**Process:**
1. Fetches last 100 completed games from ESPN for each sport
2. Stores game results with winner determination (handles draws for soccer)
3. Aggregates team statistics: W/L/D, points for/against, power rating, Elo rating
4. Indexes by sport, team, date for fast ML queries

### AI Prediction Pipeline

All ESPN data (Power Rating, Elo, H2H dominance, projected score, form, rest, injuries) is fed into GPT-5.2 prompt with a structured 10-step analysis hierarchy. AI returns `edgeBreakdown` (power/elo/form/h2h/projected edges), `confidenceFactors`, and `keyFactors` referencing specific metrics. Projected score is compared against O/U and spread lines to detect betting signals. Soccer draws reduce confidence. Edge analysis handles ties (EVEN labeling for <10 Elo or <3 Power diff).

### Important Notes

- **framer-motion**: MUST NOT be used — causes "Illegal constructor" crashes; use CSS transitions only
- **AI Integration**: Replit OpenAI proxy (gpt-5.2), no user API key needed
- **The Odds API**: `ODDS_API_KEY` env var; sport key mapping in `SPORT_KEY_MAP`
- **ESPN API**: public, no auth; fetches team records, recent form (last 10 games), injuries, standings, offensive/defensive ranks, power ratings, Elo, and multi-season head-to-head (last 3 seasons) via `teamStats.ts`
- **Auto-Resolve**: `autoResolveSportsPredictions()` in `utils/autoResolve.ts` fetches completed game scores from The Odds API `/scores` endpoint, matches them against pending predictions by event ID, determines winners (handles draws for soccer), and updates `wasCorrect`/`actualWinner` in the DB. Runs on startup + every 30 minutes via `setInterval`. Manual trigger: `POST /api/sports/predictions/auto-resolve`. Uses 3-hour buffer after commence time to avoid checking games still in progress. Results feed back into AI prompt historical accuracy section for self-training.
- **Weather**: Open-Meteo, no key

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.

### Docker Support

Files: `Dockerfile`, `docker-compose.yml`, `docker-entrypoint.sh`, `.dockerignore`

Multi-stage build:
1. **base** — installs pnpm + all deps
2. **frontend-build** — builds Vite frontend with `BASE_PATH="/"`
3. **backend-build** — esbuild bundles API server to CJS
4. **production** — slim image with prod deps only + both build outputs

In Docker, the API server serves the frontend static files (enabled by `DOCKER=true` env var in `app.ts`).

Quick start:
```bash
cp .env.example .env   # fill in OPENAI_API_KEY, ODDS_API_KEY
docker compose up --build
# App available at http://localhost:8080
```

Environment variables:
- `DATABASE_URL` — auto-configured by docker-compose (points to `db` service)
- `OPENAI_API_KEY` — your OpenAI API key (auto-mapped to AI_INTEGRATIONS_* vars)
- `ODDS_API_KEY` — The Odds API key for live sports odds
- `PORT` — server port (default: 8080)
