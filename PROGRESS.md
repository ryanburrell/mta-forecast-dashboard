# NYC MTA Forecasting Dashboard — Project Status

Ongoing status/handoff doc. Also useful as an opening message to prime a
fresh Claude conversation about this project.

**Live:** https://mta-forecast-dashboard.vercel.app/
**Repo:** https://github.com/ryanburrell/mta-forecast-dashboard
**Local path:** `c:\Users\ryanl\Documents\VSCode\Projects\NY MTA Forecasting`

## What this is

A public, live dashboard forecasting NYC subway demand-vs-capacity and
delay risk, by route and date. Built as a portfolio piece demonstrating
end-to-end engineering: real public data → ETL → database → deployed app,
verified live at every stage rather than assumed to work.

Three planning docs in the repo root are authoritative: `PRD-mta-forecasting-dashboard.md`,
`tech-stack-mta-forecasting-dashboard.md`, `data-sources.config.json` (now
at `etl/config/data-sources.config.json`).

## Architecture (Option A — precomputed, not live inference)

- `/etl` — standalone Python pipeline. Pulls public MTA/GTFS data, computes
  two forecast models, writes results to Supabase. Runs on a GitHub Actions
  daily cron (`.github/workflows/etl-schedule.yml`), or manually via
  `python run_pipeline.py --write-to-supabase`.
- Supabase (Postgres + PostGIS) — the only shared state. RLS restricts the
  public `anon` key to `SELECT` only; only the ETL's service-role key can
  write.
- `/app` — Next.js 16 (App Router) dashboard, deployed on Vercel, connected
  to GitHub for auto-deploy on push to `main`. Every API route
  (`src/app/api/**`) is a thin read-only Supabase query — **the app never
  runs a model**.

## Phase 1 — demand vs. capacity (Model 1) — done

- Ingests MTA hourly ridership (Socrata `5wq4-mkjj`) and GTFS static
  schedule (routes/trips/calendar from the Supplemented feed).
- US holidays excluded from training via the `holidays` Python package.
- Model: seasonal-naive average of ridership by route × day-of-week,
  paired with GTFS's actual scheduled trip count for that day. No
  regression/fitting — a deliberate simplicity judgment call.
- App: route multi-select, a date picker (client-side derives day-of-week
  from the picked date — the model has no real per-date granularity),
  demand-vs-supply chart, station-point map (colored/sized by forecast
  ridership), disclosure footnote, "last updated" timestamp.

Judgment calls worth knowing:
- `station_demand` and `station_routes` tables were added beyond the
  original tech-stack doc schema, to support the station map's coloring
  and route-filtering.
- Route grain reconciliation across three different naming conventions
  (ridership dataset collapses expresses and combines all 3 shuttles into
  "S"; GTFS is more granular) — handled in `etl/lib/route_labels.py`.
- Demand double-counts ridership at transfer stations (a station's total
  ridership is attributed in full to every route serving it) — disclosed,
  not hidden.
- Staten Island Railway excluded (PRD NG2, subway only).
- Training window: code default is 56 days; live data has been
  regenerated at the correct default after an earlier 21-day test value
  was accidentally left live for a while.

## Phase 2 — delay risk (Model 2) + route-line map — done

- The originally-planned incidents dataset (`uqnw-2qfk`) turned out to be
  auth-gated (403). Found its actual public replacement (`ereg-mcvp`, MTA
  Subway Major Incidents) plus a second dataset for delay minutes
  (`r7qk-6tcy`, Customer Journey-Focused Metrics) via Socrata's catalog
  search API — neither was in the original source list.
- **p_incident**: expected major incidents/day, from `ereg-mcvp`. Only a
  weekday/weekend split exists (no real Mon–Sun data) — broadcast to
  matching days.
- **expected_delay_minutes**: ridership-weighted average of Additional
  Platform Time + Additional Train Time, from `r7qk-6tcy`. Only a
  peak/off-peak split exists — one flat number per route, doesn't vary by
  day at all.
- **expected_degradation_pct** (derived, not from a dataset):
  `p_incident × 50 ÷ scheduled_trips × 100` — 50 is MTA's own qualifying
  threshold for "major incident" (50+ trains delayed), so this is a
  transparent lower-bound heuristic, not a fitted model.
- Route-label reconciliation: "JZ" combined → duplicated to both J and Z;
  three named shuttles → aggregated into this project's combined "S"; **W
  has zero rows anywhere in the incidents dataset's history** (verified
  directly) — its incidents are historically folded into N's reporting, so
  W borrows N's numbers rather than showing a misleading fabricated zero.
- FR-15: GTFS `shapes.txt` parsed into PostGIS LineStrings, multiple
  shapes per route kept distinct (real branches, e.g. the 5 train has 35).
- App: view toggle (Demand vs. supply / Delay risk), delay-risk chart,
  route-line map layer — colored by the route's **real MTA line color**
  (not a risk-value gradient) with risk encoded via line weight/opacity
  instead, since ~23 same-colored-by-risk lines sharing track in
  Manhattan would be unreadable.
- Disclosure footnote reorganized into "Demand & capacity" / "Delay risk"
  sections. The fleet-maintenance caveat was reframed as an accepted
  assumption (scheduled capacity is assumed to already reflect planned
  maintenance) per explicit direction, not left as an open gap.

## `/rationale` page — early draft, done

A separate page (linked from the dashboard header) explaining the *why*
behind each forecast's design — complementing the footnote's *what/how*.
Has one paragraph each for Demand & capacity and Delay risk, plus real
production screenshots (not mockups). **Text is an explicit first draft**
— the user said "we will go through the text and refine after," so expect
follow-up work polishing this copy.

## Infrastructure/session gotchas worth knowing

- This dev machine runs Avast with HTTPS scanning enabled, which breaks
  Python's TLS certificate verification for outbound requests (its
  locally-generated CA fails OpenSSL 3.x's strict validation). Not an
  issue in GitHub Actions or for the deployed app — only affects running
  the ETL directly from this machine. A local-only dev shim
  (`sitecustomize.py`, never committed) was used repeatedly during
  development to work around it for live-data testing.
- Next.js 16.2.10 postdates this assistant's training data. The scaffold's
  `AGENTS.md` flags this explicitly — check `node_modules/next/dist/docs/`
  before assuming older-Next.js patterns. Two concrete differences that
  bit us: `fetch` isn't cached by default anymore (opposite of Next
  13/14), and client-side data fetching should use `useSWR`, not a raw
  `useEffect` + `setState` (the bundled ESLint config flags the latter).
- GitHub push once failed because Windows had cached credentials for an
  unrelated account (`ravburrell-sudo`) instead of the repo owner
  (`ryanburrell`) — fixed by clearing those entries from Windows
  Credential Manager (`cmdkey /delete`).
- A `dbpw.txt` file (Supabase DB password) was found sitting unprotected
  in the repo root partway through Phase 2. It's gitignored and was never
  committed, but **it's still sitting on disk** — worth moving to a
  password manager and deleting.
- Live ETL runs are slow: Socrata's aggregation queries run ~30–50s per
  50k-row page, so a full pipeline run (both models, 56-day window) takes
  roughly 15 minutes.

## Current data state

Supabase's `model_runs` table has several historical Model 1 runs from
iterative testing during development, plus the current Model 1 and Model 2
runs. This is expected — the design is append-only (nothing is ever
deleted), and every API route reads only the latest run per model, so old
runs are harmless.

## What's not done yet

- **Phase 3** (PRD): Model 3 (crowding risk) and the event-scenario
  toggle. Not started.
- Refining the `/rationale` page's prose (explicitly deferred).
- The GitHub Actions scheduled workflow has secrets configured but hasn't
  been explicitly re-confirmed to have run successfully on its own
  schedule (vs. the manual `--write-to-supabase` runs done during this
  session) — worth checking the Actions tab.
