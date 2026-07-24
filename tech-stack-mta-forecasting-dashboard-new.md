# Technical Architecture & Stack Document
## MTA Subway Forecasting Dashboard

**Companion document to:** PRD-mta-forecasting-dashboard.md
**Intended audience:** Claude Code (implementation reference)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  SCHEDULED PIPELINE (GitHub Actions, cron)                   │
│                                                                │
│  Python job:                                                  │
│   1. Pull MTA Subway Hourly Ridership (Socrata REST API)      │
│   2. Pull GTFS static (routes, stops, schedules)               │
│   3. Pull holiday calendar + NYC Special Event Permits         │
│   4. Run Model 1 / Model 2 / Model 3                            │
│   5. Write precomputed forecast tables to Supabase (Postgres)  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  SUPABASE (Postgres + PostGIS)                                │
│   - Precomputed forecast tables (read-only from app's view)   │
│   - Reference tables: stations, routes                        │
│   - model_runs metadata table (freshness/versioning)          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  NEXT.JS APP (Vercel)                                          │
│   - API routes: thin query layer over Supabase, no compute    │
│   - React UI: parameter panel, charts (Recharts/Tremor),      │
│     map (React-Leaflet)                                        │
└─────────────────────────────────────────────────────────────┘
```

The Next.js app never runs a forecasting model. It queries precomputed
results. This is the load-bearing architectural decision (see PRD §6).

## 2. Stack Summary

| Layer | Technology | Notes |
|---|---|---|
| Frontend framework | Next.js (App Router) | Match version conventions used in dsr-commercial where reasonable |
| UI library | React | |
| Styling | Tailwind CSS | |
| Charts | Recharts or Tremor | Tremor preferred if dashboard/KPI-card layout is wanted out of the box |
| Map | React-Leaflet + OpenStreetMap tiles | No API key required for v1 |
| Database | Supabase (Postgres) with **PostGIS extension enabled** | Single managed datastore for both relational and geo data |
| ETL / modeling language | Python 3.11+ | statsmodels, Prophet, scikit-learn, pandas |
| Scheduling | GitHub Actions (cron trigger) | Free tier; alternative: Vercel Cron hitting a trigger endpoint |
| Hosting (app) | Vercel | |
| Hosting (DB) | Supabase Cloud | |
| Version control | GitHub | Required for GitHub Actions anyway |

No paid services required for v1 at portfolio-level traffic.

## 3. Frontend

- **Framework:** Next.js, App Router, React Server Components where
  sensible for initial data loads; client components for interactive
  parameter panel / map.
- **State:** A single parameter-selection state (route, day-of-week,
  scenario toggle, active view) should drive both the chart and map
  components — avoid duplicating selection state across components (per
  PRD FR-14).
- **Charts:** Recharts for line/bar comparisons (demand vs. supply, expected
  delay minutes). Tremor if a KPI-card + chart combined layout is desired
  with less custom styling work.
- **Map:** `react-leaflet`, rendering GeoJSON `FeatureCollection` responses
  from the API routes (see §7). Station points styled by the active
  forecast metric's value (color scale — a simple sequential scale is
  sufficient, no need for a complex legend system in v1).

## 4. Backend / Data Layer

- **Supabase** serves as the single datastore. Enable the **PostGIS**
  extension (one click in Supabase dashboard) at project creation — do not
  add this later, it's free and trivial to enable up front.
- **Next.js API routes** are read-only query endpoints against Supabase.
  No write access should be exposed from the app layer — all writes come
  from the Python ETL job using a service-role key, kept server-side only
  (GitHub Actions secret, never exposed to the frontend).
- Use `ST_AsGeoJSON(...)` in Supabase SQL views/queries to hand the API
  route pre-formatted GeoJSON, minimizing transformation logic in
  JavaScript.

## 5. ETL & Forecasting Pipeline (Python)

- **Trigger:** GitHub Actions scheduled workflow (`schedule: cron`),
  default daily — confirm actual cadence per PRD Open Question OQ-3.
- **Libraries:**
  - `pandas` — data wrangling
  - `statsmodels` — Negative Binomial regression (Model 2 incident
    frequency), gamma/log-linear regression (Model 2 severity)
  - `prophet` — optional, for Model 1 seasonal baseline if the
    seasonal-naive approach proves insufficient
  - `scikit-learn` — if Model 3 crowding-risk classification is built as
    logistic regression / gradient boosting
- **Output:** the job writes directly to Supabase via the Python
  `supabase-py` client or a direct `psycopg2`/`sqlalchemy` connection,
  using a service-role key stored as a GitHub Actions secret.
- **Idempotency:** each run should be tagged with a `model_runs` row
  (see §7 schema) so re-running the job doesn't corrupt or silently
  duplicate the forecast tables — prefer upsert-by-key over blind insert.

## 6. Spatial Layer Specifics

- **v1 (Phase 1–3 per PRD):** station points only, sourced from lat/long
  already present in the MTA hourly ridership dataset.
- **Phase 2 addition:** GTFS `shapes.txt` parsing for route-line geometry
  (Model 2). This is polyline data (ordered lat/long sequences per shape
  ID) — parse once in the Python ETL job, store as a PostGIS `LINESTRING`
  geometry column, not as raw text, so the API route can again just emit
  `ST_AsGeoJSON`.
- **Tile provider:** OpenStreetMap public tiles for v1 (free, no key).
  **Documented upgrade path:** MapTiler free tier (100k loads/month) if
  traffic or fair-use concerns arise — swap is a single URL/config change
  in the Leaflet tile layer setup, not an architecture change.

## 7. Data Model (Supabase / Postgres — proposed)

This is a starting schema for Claude Code to implement and refine, not a
frozen spec.

```
stations
  station_complex_id   text primary key
  station_name         text
  borough              text
  geom                 geography(Point, 4326)   -- PostGIS

routes
  route_id             text primary key
  route_name           text
  mode                 text                     -- 'subway' (v1 only)

route_shapes                                     -- Phase 2
  route_id             text references routes
  geom                 geography(LineString, 4326)

forecast_demand_supply                           -- Model 1
  id                    bigserial primary key
  route_id              text references routes
  day_of_week           smallint                 -- 0-6
  forecast_ridership    numeric
  forecast_scheduled_trips numeric
  model_run_id          bigint references model_runs

forecast_delay_risk                              -- Model 2
  id                    bigserial primary key
  route_id              text references routes
  day_of_week           smallint
  p_incident            numeric
  expected_delay_minutes numeric
  expected_degradation_pct numeric
  model_run_id          bigint references model_runs

forecast_crowding_risk                           -- Model 3
  id                    bigserial primary key
  station_complex_id    text references stations
  day_of_week            smallint
  p_exceed_threshold    numeric
  baseline_ridership    numeric
  event_uplift_coef     numeric
  model_run_id          bigint references model_runs

model_runs                                        -- freshness/versioning
  id                    bigserial primary key
  model_name            text                      -- 'model_1' | 'model_2' | 'model_3'
  run_timestamp         timestamptz
  data_window_start     date
  data_window_end       date
  notes                 text
```

`model_run_id` foreign keys on every forecast table are what power FR-16
(surface "last updated" per view) — join to `model_runs.run_timestamp`.

## 8. External Data Sources & Endpoints

**All external source URLs live in `/etl/config/data-sources.config.json`,
not hardcoded in individual scripts.** Every ETL script should read its
source endpoint from this file. This means a source change (MTA moves a
URL, a new dataset edition is published, etc.) is a one-line JSON edit,
not a code change hunt across multiple scripts.

| Source | Endpoint (see config file for authoritative copy) | Status |
|---|---|---|
| MTA Subway Hourly Ridership | `https://data.ny.gov/resource/5wq4-mkjj.json` | **Verified live** — Socrata SODA API, supports `$where`/`$limit`/`$select` |
| MTA Subway Major Incidents (delay/incident basis, Model 2) | `https://data.ny.gov/resource/uqnw-2qfk.json` ("Beginning 2025" edition) | **Confirmed to exist** on the same Socrata platform/domain as the ridership dataset — resolves PRD OQ-1. Monthly granularity, by subway-line/delay-category/division/day-type. **Only covers "major incidents" (50+ trains delayed)** — undercounts routine minor delays; this limitation must be disclosed per PRD FR-12/NG6. Confirm exact column names on first real ETL run. |
| GTFS Static — Regular | `https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip` | **Verified** — MTA's official HTTPS endpoint; updated only a few times/year |
| GTFS Static — Supplemented | `https://rrgtfsfeeds.s3.amazonaws.com/gtfs_supplemented.zip` | **Verified, recommended for Model 1 supply-side** — reflects planned service changes, updated hourly, unlike the Regular feed |
| US holiday calendar | Python `holidays` package | Not yet confirmed as final choice — flagged in config |
| NYC Special Event Permits | NYC Open Data (Socrata) | **Not yet verified** — dataset ID still TBD, needed before Phase 3 |

**Do not hardcode a `$limit` that silently truncates results** — the
ridership dataset is large; the ETL job should paginate (`$offset` +
`$limit`) or use `$where` date-bounding per run rather than attempting a
single unbounded pull.

## 9. Proposed Repository Structure

```
/mta-forecast-dashboard
  /app                      # Next.js App Router
    /api
      /routes               # GET list of subway routes
      /stations              # GET list of stations
      /forecast
        /demand-supply       # GET, query params: route, day_of_week
        /delay-risk           # GET, query params: route, day_of_week
        /crowding              # GET, query params: station, day_of_week, event_scenario
      /geo
        /stations.geojson      # GET, GeoJSON FeatureCollection
        /routes.geojson         # GET, Phase 2
    /explainer                  # academic explainer page (PRD FR-17/18) - project's entry point
    /(dashboard routes/pages)
  /public
    /explainer                  # the 6 visual/concept assets (see PRD §15), referenced by /explainer page only
  /components
    /parameter-panel
    /charts
    /map
  /lib
    /supabase                 # client setup, following existing DAL pattern conventions
  /etl                          # Python — separate from Next.js app, not deployed to Vercel
    /config
      /data-sources.config.json  # single source of truth for all external URLs/dataset IDs
    /pull_mta_data.py
    /pull_gtfs.py
    /pull_incidents.py
    /model_1_demand_supply.py
    /model_2_delay_risk.py
    /model_3_crowding.py
    /write_to_supabase.py
    requirements.txt
  /.github
    /workflows
      /etl-schedule.yml
  PRD-mta-forecasting-dashboard.md
  tech-stack-mta-forecasting-dashboard.md
```

Keep `/etl` fully decoupled from the Next.js `/app` — it should be
runnable and testable independently (`python etl/model_1_demand_supply.py`
locally), with no import dependency in either direction.

## 10. Environment Variables / Config

| Variable | Used by | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Next.js (client) | Public, read-only anon access |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Next.js (client) | Public, anon role — read-only via Row Level Security |
| `SUPABASE_SERVICE_ROLE_KEY` | Python ETL only | **Never expose to frontend/client** — GitHub Actions secret only |
| `MTA_SOCRATA_APP_TOKEN` | Python ETL | Optional but recommended — raises Socrata's unauthenticated rate limit |

**Row Level Security:** enable RLS on all Supabase tables; grant the anon
role `SELECT`-only on forecast/reference tables, no `INSERT`/`UPDATE`/
`DELETE`. Writes happen exclusively via the service-role key from the ETL
job, never from the app.

## 11. Deployment & Hosting

- **Next.js app:** Vercel, connected to the GitHub repo, auto-deploy on
  push to main.
- **Database:** Supabase Cloud project, free tier.
- **ETL scheduling:** GitHub Actions workflow on a cron schedule, using
  repo secrets for `SUPABASE_SERVICE_ROLE_KEY` and `MTA_SOCRATA_APP_TOKEN`.
- **Custom domain:** optional, not required for v1 — Vercel's default
  `*.vercel.app` domain is sufficient for a portfolio link.

## 12. Cost Summary

All components run on free tiers at expected portfolio traffic:
Vercel (Hobby), Supabase (Free), GitHub Actions (free minutes,
well within limits for a daily cron job), OpenStreetMap tiles (free,
fair-use). **Total expected cost: $0/month.**

## 13. Dev Workflow Notes for Implementation

- Build and verify the ETL pipeline (`/etl`) independently first, writing
  to a local or dev Supabase project, **before** wiring up the Next.js
  frontend — this matches PRD Phase 1 acceptance criteria and avoids
  debugging both layers simultaneously.
- Model 2 implementation should **not begin** until PRD Open Question
  OQ-1 (delay/incident data source) is explicitly resolved — flagged here
  again because it's a hard blocker, not a nice-to-have clarification.
- Favor Supabase views (SQL) over application-layer joins/aggregation
  where reasonable — keeps the Next.js API routes thin, consistent with
  the "query-and-render layer" principle in PRD §6.
- Follow existing project conventions from dsr-commercial where they
  transfer cleanly (e.g., separating Supabase clients by role/context) —
  don't reinvent patterns already proven to work.

## 14. Future Upgrade Paths (explicitly deferred, not forgotten)

- **Option B (live inference):** a small FastAPI service (Railway/Render
  free tier) for Model 3's event-scenario computation, if precomputed
  coefficients prove too limiting in practice.
- **Route-line rendering (Model 2):** GTFS `shapes.txt` → PostGIS
  `LINESTRING` (Phase 2, already scoped in PRD).
- **Tile provider upgrade:** MapTiler free tier if OSM fair-use becomes a
  constraint.
- **Bus/LIRR/Metro-North expansion:** out of scope for v1 (PRD NG2), but
  the schema's `mode` column on `routes` is deliberately included now to
  make this a additive change later, not a schema rewrite.
