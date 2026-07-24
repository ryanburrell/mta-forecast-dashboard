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

## Planning docs — read this before trusting any doc in the repo root

The repo root has **two generations** of planning docs. The `-new` files
are authoritative; the non-suffixed originals are kept for archival only:

- `PRD-mta-forecasting-dashboard-new.md` — authoritative PRD (defines
  FR-1 through FR-18, including §15's image-asset mapping and §16's
  explainer-page copy)
- `tech-stack-mta-forecasting-dashboard-new.md` — authoritative
  architecture doc (repo structure, schema, data sources)

**Two files referenced as part of this doc generation are still missing
from the repo** and have not been provided yet:
- `data-sources.config-new.json` — does not exist anywhere in the repo.
  The actual, working config is `etl/config/data-sources.config.json`
  (no "-new" suffix — it was never renamed, just corrected in place
  during Phase 2 work). It's already correct; the point of friction is
  that nothing named `data-sources.config-new.json` exists to compare it
  against or to treat as the literal authoritative source per the
  new-docs naming convention.
- `setup-steps-mta-forecasting-dashboard-new.md` — does not exist
  anywhere in the repo. Unknown contents/relevance until provided.

**Known factual error in both `-new` docs, not yet corrected in the docs
themselves:** PRD-new §14 (OQ-1) and tech-stack-new §8 both still state
the Model 2 incidents dataset `uqnw-2qfk` is "resolved"/"confirmed
public." It is not — it returns `403 authentication_required` (checked
twice, in two separate sessions). The actual working replacement,
`ereg-mcvp`, plus a second dataset needed for delay minutes that neither
doc mentions at all (`r7qk-6tcy`), were found via Socrata's catalog
search API and are already correctly wired into
`etl/config/data-sources.config.json` and the ETL code. **The code is
right; the docs are stale on this specific point.**

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

## Phase 2 — delay risk (Model 2) + route-line map — done, re-confirmed

Built in an earlier session; re-audited against the updated PRD's Phase 2
scope (FR-5, FR-9 delay-risk portion, FR-10 delay-risk view, FR-15) in
this session and confirmed nothing is outstanding. Live in production.

- The originally-planned incidents dataset (`uqnw-2qfk`) turned out to be
  auth-gated (403). Found its actual public replacement (`ereg-mcvp`, MTA
  Subway Major Incidents) plus a second dataset for delay minutes
  (`r7qk-6tcy`, Customer Journey-Focused Metrics) via Socrata's catalog
  search API — neither was in the original source list, and neither is
  correctly reflected in the current planning docs (see the "Planning
  docs" section above).
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

## `/explainer` page (FR-17/FR-18) — done

The project's entry point per the updated PRD — a general/academic
audience page explaining methodology, reached externally from the
portfolio profile page (not the live dashboard directly). Distinct from
`/rationale` (below): this page explains *what each model does and why
it's grounded the way it is*, in accessible language reviewed and
approved by Ryan; `/rationale` explains *engineering judgment calls* for
a more technical reader.

- Section order (PRD §15, resolved): hero (transit-map image) → overview
  (two-lines image) → Model 1 (balance-beam + wavy-lines images) → data
  pipeline (ribbons image) → Model 2 (no image, intentional) → Model 3
  (crowd-train image) → Option A disclosure (no image).
- Copy is transcribed verbatim from PRD §16, not paraphrased — flagged
  rather than silently edited per instruction.
- Six images copied from the repo-root `img/` folder into
  `app/public/explainer/` with clean filenames (Next.js only serves
  static assets from `/public`). Two additional "spare" variants exist in
  `img/` but were deliberately not used or copied, per PRD §15's resolved
  variant selection.
- Linked from the dashboard header ("Project methodology →"), alongside
  the existing `/rationale` link.
- Note worth surfacing, not yet acted on: the Model 2 and Model 3
  sections describe both models in present tense as fully operational.
  Model 2 is genuinely live; Model 3 is not built at all yet (Phase 3
  hasn't started). This was flagged, not silently changed, since the
  copy was explicitly pre-approved as-is.

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
- Large `git push`es (e.g. adding several MB of images) can time out a
  30s tool call without actually failing — the commit lands either way;
  just retry the push.

## Current data state

Supabase's `model_runs` table has several historical Model 1 runs from
iterative testing during development, plus the current Model 1 and Model 2
runs. This is expected — the design is append-only (nothing is ever
deleted), and every API route reads only the latest run per model, so old
runs are harmless.

## What's not done yet

- **Two "-new" planning doc files are still missing**: `data-sources.config-new.json`
  and `setup-steps-mta-forecasting-dashboard-new.md`. Needed to confirm
  whether they change anything already built, before treating the
  "-new" doc generation as fully reconciled with the codebase.
- **The stale `uqnw-2qfk` reference in both `-new` docs** hasn't been
  corrected in the docs themselves (code is already right — see
  "Planning docs" section above).
- **Phase 3** (PRD): Model 3 (crowding risk) and the event-scenario
  toggle. Not started. Two explicit blockers flagged before starting,
  per the user's own instruction not to work around them with a guess:
  **OQ-2** (crowding threshold definition — not yet resolved in any doc
  seen so far) and the **NYC Special Event Permits dataset** (still
  marked `TBD` for dataset ID/endpoint).
- Refining the `/rationale` page's prose (explicitly deferred).
- Whether the Model 2/Model 3 present-tense framing on `/explainer`
  needs a "planned" caveat for Model 3, given Phase 3 hasn't started —
  flagged, not resolved either way.
- The GitHub Actions scheduled workflow has secrets configured but hasn't
  been explicitly re-confirmed to have run successfully on its own
  schedule (vs. manual `--write-to-supabase` runs) — worth checking the
  Actions tab.
