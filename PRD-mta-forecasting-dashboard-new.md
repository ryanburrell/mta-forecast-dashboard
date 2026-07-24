# Product Requirements Document
## MTA Subway Forecasting Dashboard

**Status:** Draft v1.0 — ready for implementation
**Owner:** Ryan Burrell
**Intended audience:** Claude Code (implementation), portfolio reviewers (end users)

---

## 1. Overview

A public, lightweight web dashboard that forecasts subway demand, service
reliability, and crowding risk for the NYC MTA subway system, using publicly
available MTA open data. Users select parameters (route, day-of-week,
scenario) and view forecasts through charts and a spatial map layer.

This is a standalone project, separate from the Power BI / cross-agency
reporting work covered elsewhere. It consumes **MTA subway data only**.

## 2. Background & Motivation

Public transit ridership and service-reliability data is fragmented and
rarely presented as a forward-looking tool. Most public dashboards show
historical totals, not forecasts. This project demonstrates an end-to-end
data product: public data ingestion → statistical forecasting → an
interactive, spatially-aware dashboard — built and shipped as a portfolio
piece.

## 3. Goals

- G1: Forecast subway demand and scheduled supply, by route and
  day-of-week, under normal (non-holiday, non-event) conditions.
- G2: Forecast the impact of delays/breakdowns on realized service level,
  by route and day-of-week.
- G3: Forecast crowding-exceedance risk by station, including an optional
  "nearby event" scenario adjustment.
- G4: Present all three forecasts through a single parameter-driven UI with
  both chart and map views.
- G5: Ship something real, live, and publicly viewable — not just a local
  prototype.

## 4. Non-Goals (explicitly out of scope for v1)

- NG1: No live model retraining on user parameter change (see §6,
  Option A vs B).
- NG2: No coverage of MTA bus, LIRR, Metro-North, or bridges/tunnels — subway
  only.
- NG3: No user accounts, auth, or personalization. Fully public, read-only.
- NG4: No integration with the separate Power BI / cross-agency (TTC,
  Calgary, StatCan) reporting work.
- NG5: No route-line (GTFS `shapes.txt`) rendering in Phase 1 — station
  points only until Phase 2 (see §11).
- NG6: No real fleet-maintenance data — Model 2 uses observed delay/incident
  history as its basis, not actual agency maintenance records (which aren't
  public). This must be stated in-product (see FR-12).

## 5. Users & Use Cases

Single primary audience: portfolio reviewers (recruiters, hiring managers,
technical peers) evaluating this as a demonstration of data engineering,
forecasting, and product judgment. Secondary: the builder, as a working
analysis tool.

Representative use case: a visitor selects "L train, Saturdays," sees
forecasted ridership vs. scheduled supply, toggles to a delay-risk view,
then toggles a "nearby event" scenario and watches the crowding-risk map
update.

## 6. Guiding Principle: Lightweight but Effective

Every design decision in this PRD is filtered through one question: **does
this add real analytical value, or does it add engineering weight without
proportionate benefit?**

The core architectural decision this produces: **forecasts are precomputed
on a schedule (Option A), not computed live per request (Option B).**
Precomputation covers the full realistic parameter space (every
route × day-of-week × scenario combination is small and enumerable), so
users lose effectively nothing in practice while the app itself stays a
thin query-and-render layer with no Python runtime, no inference latency,
and minimal infrastructure to maintain.

**This is a deliberate tradeoff, and it must be disclosed in-product**
(see FR-12): a visible footnote stating that a live-inference architecture
would better serve true what-if analysis, but was intentionally deferred
for scope/cost reasons.

## 7. Functional Requirements

### 7.1 Data Ingestion (FR-1 – FR-3)
- **FR-1:** System shall ingest MTA Subway Hourly Ridership data
  (`data.ny.gov` resource `5wq4-mkjj`) on a recurring schedule.
- **FR-2:** System shall ingest GTFS static data for the subway (routes,
  stops, trip schedules) to derive scheduled supply.
- **FR-3:** System shall exclude/flag known holidays from the training
  window used for baseline (non-holiday, non-event) forecasts, using a
  public holiday calendar.

### 7.2 Forecasting Models (FR-4 – FR-6)
- **FR-4 (Model 1 — Baseline demand & supply):** For each subway route and
  day-of-week, produce a forecasted ridership figure (demand) and
  forecasted scheduled trip count (supply), under normal-day assumptions.
- **FR-5 (Model 2 — Delay/breakdown impact):** For each route and
  day-of-week, produce an expected incident count and expected delay
  minutes, translated into an expected realized-service-degradation
  percentage relative to scheduled supply.
- **FR-6 (Model 3 — Crowding risk):** For each station and day-of-week,
  produce a probability of exceeding a defined crowding threshold, plus a
  precomputed "event uplift" coefficient usable as a scenario adjustment.

### 7.3 Parameter Panel (FR-7 – FR-9)
- **FR-7:** User can select one or more subway routes.
- **FR-8:** User can select day-of-week.
- **FR-9:** User can toggle an "event scenario" on/off, which applies the
  precomputed uplift coefficient from FR-6 to the relevant station(s).

### 7.4 Dashboard Views (FR-10 – FR-11)
- **FR-10:** System shall render a chart view showing forecasted demand vs.
  supply for the selected parameters (Model 1), and a separate or combined
  view for delay-risk impact (Model 2).
- **FR-11:** System shall render a crowding-risk view (Model 3), showing
  forecast values as the user's selection changes.

### 7.5 Spatial / Map Layer (FR-13 – FR-15)
- **FR-13:** System shall render subway stations as points on an
  interactive map, colored/sized by the value of the currently selected
  forecast (demand, delay-risk, or crowding-risk, depending on active
  view).
- **FR-14:** Map shall update reactively when parameter panel selections
  change, using the same underlying query as the chart view (single source
  of truth per selection).
- **FR-15 (Phase 2):** Route-line geometry (not just station points) shall
  be added for Model 2's delay-risk view once GTFS `shapes.txt` parsing is
  implemented.

### 7.6 Transparency / Assumption Disclosure (FR-12, FR-16)
- **FR-12:** A visible, permanent footnote/info panel must state: (a) this
  is Option A (precomputed forecast grid), not live inference; (b) Model 2
  is based on observed delay/incident history, not actual fleet-maintenance
  records, which are not public; (c) holidays and known special events are
  excluded from baseline training but the "event scenario" toggle
  approximates their effect via a precomputed coefficient, not a live
  event feed.
- **FR-16:** Each forecast view should surface its model's "last updated"
  timestamp, sourced from the model-run metadata (see tech stack doc §7),
  so viewers can see data freshness.

## 8. Data Sources

| Source | Purpose | Access |
|---|---|---|
| MTA Subway Hourly Ridership (`5wq4-mkjj`) | Demand (Model 1), crowding input (Model 3) | Socrata REST API, public, no auth |
| GTFS Static (MTA subway) | Scheduled supply (Model 1), route/station geometry | Public static feed |
| MTA Subway Major Incidents (`uqnw-2qfk`) | Delay/incident basis (Model 2) | Confirmed to exist, public, Socrata. Monthly, by line/category/division/day-type. Covers only "major incidents" (50+ trains delayed) — this scope limitation must be disclosed per FR-12/NG6, not silently treated as full delay coverage. |
| Public holiday calendar (US) | Exclusion filter for baseline training | Public dataset/library |
| NYC Special Event Permits (NYC Open Data) | Event-uplift coefficient basis (Model 3) | Public, Socrata |

## 9. Non-Functional Requirements

- **NFR-1 (Cost):** All infrastructure must run on free tiers (Vercel,
  Supabase, GitHub Actions) at portfolio-level traffic.
- **NFR-2 (Performance):** Dashboard interactions (parameter change → chart
  + map update) should feel instant — target < 500ms, achievable because
  Option A means no live model computation sits in the request path.
- **NFR-3 (Public access):** No login required. No PII collected or
  stored.
- **NFR-4 (Refresh cadence):** Forecast data refreshed on a schedule
  (default: daily) — not real-time, and the product should not imply
  real-time freshness.
- **NFR-5 (Resilience):** If the MTA source endpoint is unreachable during
  a scheduled ETL run, the app should continue serving the last
  successfully computed forecast rather than failing.

## 10. Success Metrics

Since this is a portfolio piece rather than an operational tool, success is
qualitative/demonstrative rather than KPI-driven:
- End-to-end pipeline runs unattended on schedule without manual
  intervention.
- All three models produce forecasts that are directionally sensible when
  spot-checked against known ridership patterns (e.g., rush-hour stations
  show higher demand).
- Dashboard is publicly reachable, loads without errors, and clearly
  communicates its own limitations (FR-12).

## 11. Phased Delivery Plan

**Phase 1 (MVP):**
- FR-1, FR-2, FR-3, FR-4, FR-7, FR-8, FR-10 (demand/supply only), FR-13,
  FR-14, FR-12, FR-16, FR-17, FR-18.
- Acceptance: a user can select a route + day-of-week and see forecasted
  demand vs. supply as both a chart and a station-point map. Additionally,
  the explainer page is live and reachable from the portfolio profile
  page, with all six visual assets placed and the methodology/disclosure
  content readable — since this is the project's intended entry point, it
  should not slip to a later phase even though it doesn't gate the
  dashboard's own functionality.

**Phase 2:**
- FR-5, FR-9 (delay-risk portion), FR-10 (delay-risk view), FR-15
  (route-line geometry).
- Acceptance: delay-risk forecasts are viewable per route/day-of-week, with
  route lines (not just points) on the map.

**Phase 3:**
- FR-6, FR-9 (crowding/event scenario), FR-11.
- Acceptance: crowding-risk view works with the event-scenario toggle
  applying a visible, explained adjustment to the map and chart.

## 12. Assumptions & Constraints

- Subway mode only; MTA data source assumed stable per verification
  already performed (see project chat history — endpoint confirmed live).
- Precomputed grid (Option A) is a permanent v1 architectural constraint,
  not a temporary placeholder — disclosed accordingly (FR-12), not silently
  treated as equivalent to live inference.
- Model 2's delay basis is not fleet-maintenance data (unavailable
  publicly) — it is derived from observed service/delay patterns in the
  data actually available. Any maintenance-schedule assumptions used are
  illustrative only and must be labeled as such if surfaced in-product.
- No budget for paid map tiles, paid database tier, or paid compute in v1.

## 13. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| MTA API structure changes without notice | ETL job should fail loudly (logged) and fall back to last-good data (NFR-5), not silently serve stale/broken data |
| Precomputed grid feels "static" to reviewers expecting a live tool | FR-12 disclosure frames this as an intentional, explained tradeoff — turns a limitation into a demonstrated judgment call |
| Delay/incident data source for Model 2 may not exist in the clean form assumed | Flagged explicitly in Open Questions (§14) — needs resolution before Phase 2 build starts |
| OSM tile fair-use limits under unexpected traffic | Documented upgrade path to MapTiler free tier in tech stack doc |

## 14. Open Questions

- ~~**OQ-1**~~ **RESOLVED:** MTA publishes "MTA Subway Major Incidents"
  (`uqnw-2qfk`, Socrata, `data.ny.gov`) — monthly, by line/category/
  division/day-type. Note the scope caveat carried into §8 and NG6: it only
  covers incidents delaying 50+ trains, not routine minor delays. All
  source URLs (this one, GTFS static, ridership) are now centralized in
  `data-sources.config.json` — see companion tech stack doc §8.
- **OQ-2:** Confirm exact crowding threshold definition for Model 3 (e.g.,
  entries/hour relative to platform or train capacity) — needs a stated,
  defensible basis rather than an arbitrary cutoff. Still open.
- **OQ-3:** Confirm refresh cadence (daily vs. weekly) based on actual
  GitHub Actions free-tier scheduling limits and MTA data update frequency.
  Note the two GTFS feeds differ in native update frequency (Regular:
  a few times/year; Supplemented: hourly) — cadence choice should account
  for using the Supplemented feed as the supply-side source. Still open.

## 15. Visual & Concept Assets

A set of abstract concept illustrations has been generated to support this
project (portfolio case-study presentation and/or in-app section art —
confirm intended use before final placement, see note below). Source files
live at:
`C:\Users\ryanl\Documents\VSCode\Projects\NY MTA Forecasting\img`

These are **conceptual/illustrative assets, not UI wireframes** — they
communicate the underlying ideas (imbalance, convergence, forecasting)
visually rather than depicting actual dashboard screens. Suggested mapping
to project concepts:

| Asset | Concept illustrated | Resolved placement |
|---|---|---|
| `Abstract_balance_beam_weighted_202607231301.jpeg` | Demand/supply imbalance | Model 1 section — primary image |
| `Abstract_composition_transit_map_202607231255.jpeg` | Route lines + forecast waveforms | **Page hero** (selected over the `...1254` variant — clearer station-node markers) |
| `Abstract_composition_transit_map_202607231254.jpeg` | (unused variant) | Not used — kept as a spare/alternate only |
| `Abstract_crowd_and_train_imbalance_202607231259.jpeg` | Crowd vs. train capacity | Model 3 section (selected over the `...1258` variant — segmented train windows read more clearly) |
| `Abstract_crowd_and_train_imbalance_202607231258.jpeg` | (unused variant) | Not used — kept as a spare/alternate only |
| `Ribbons_untangling_and_reorganiz_202607231302.jpeg` | Raw data converging into a pipeline | "How it's built" / data pipeline section (not tied to a single model) |
| `Two_lines_intersecting_glowing_p_202607231300.jpeg` | Supply/demand equilibrium | Page overview/intro section, before the three model sections |
| `Wavy_lines_representing_average_202607231257.jpeg` | Baseline against variance | Model 1 section — secondary image, paired with the baseline-method sub-explanation |

Model 2 (delay/reliability) has no dedicated image from this set — that's
intentional, not a gap to fill by reassigning an image that belongs
elsewhere.

## 16. Explainer Page Copy (Draft — for review, not final)

The following is source content for FR-17/FR-18. It is drafted directly
from §6, §7.2, and §8 of this PRD — Claude Code should use this text
(subject to Ryan's edits) rather than independently paraphrasing the PRD's
model definitions, so the explainer page's language stays consistent with
this document.

**Overview (intro section, paired with the two-lines-intersecting image):**
> This project forecasts subway demand, service reliability, and crowding
> risk across the New York City subway system, using only data the MTA
> and the City of New York already publish openly. Rather than modeling
> a single number, it treats transit capacity as what it actually is — a
> balance between how many people want to travel and how much service is
> realistically available to carry them, a balance that public schedules
> alone don't capture.

**Model 1 — Baseline Demand & Supply (paired with balance-beam image;
wavy-lines image with the baseline-method note):**
> For a given subway route and day of the week, this model forecasts two
> figures side by side: expected ridership (demand) and expected
> scheduled service (supply), under ordinary conditions — explicitly
> excluding holidays and known city-wide events, which are treated
> separately. Demand is grounded in the MTA's own hourly station-entry
> data; supply is grounded in the MTA's published GTFS schedule feed.
> The baseline method compares a given day against its own historical
> pattern — the same day of the week, averaged over recent weeks — a
> deliberately simple starting point that is often surprisingly hard to
> beat for transit, where day-of-week is the dominant driver of ridership
> patterns.

**Data pipeline (paired with ribbons-untangling image):**
> None of these forecasts exist in the MTA's raw data as published —
> ridership counts, delay records, and schedule feeds are separate
> datasets, in separate formats, on separate update schedules. A
> scheduled pipeline pulls each of them, reconciles them onto a common
> route/day-of-week structure, and writes the resulting forecasts to a
> database the dashboard reads from directly.

**Model 2 — Delay & Service-Reliability Forecast (no image):**
> This model forecasts how often service disruptions are likely to occur
> on a given route and day of the week, and how severe they tend to be
> once they happen — translated into an expected reduction in realized
> service relative to what's scheduled. It's grounded in the MTA's own
> published incident records. One limitation worth stating plainly: the
> MTA's public incident data only captures *major* incidents — those
> delaying 50 or more trains — so this forecast reflects large-scale
> disruption risk, not the full universe of minor day-to-day delays.

**Model 3 — Crowding Risk (paired with crowd-train image):**
> This model estimates the likelihood that a given station will exceed a
> defined crowding threshold on a given day of the week, and includes an
> optional adjustment for nearby permitted city events — a concert or
> parade near a station measurably changes expected ridership there, and
> this model is the one place in the project that accounts for that
> directly rather than treating it as noise.

**Disclosure section (no image — text only, drawn from PRD §6):**
> A note on how this works under the hood: forecasts on this dashboard
> are precomputed on a recurring schedule, not calculated live each time
> you change a filter. This was a deliberate choice — the realistic range
> of route/day-of-week/scenario combinations is small enough that
> precomputing all of them costs little in practice, while keeping the
> application itself simple, fast, and inexpensive to run. The tradeoff
> is that this dashboard can't yet answer arbitrary novel what-if
> questions the way a live-inference system could — that would be a
> reasonable next iteration of this project, not something this version
> attempts.

**Resolved:** these assets are for an **academic explainer page** — a
dedicated page within the dashboard app explaining the project's
methodology, forecasting approach, and data sources to a general/academic
audience. It is reached externally via a link from the portfolio profile
page, not hosted separately on the portfolio site itself. See new
FR-17/FR-18 below.

**Asset location:** the six files have been placed in the repo at an
`img/` subfolder in the project root. Next.js only serves static files by
URL from `/public`, so these need to be copied (not just referenced) into
`/public/explainer` as part of building the explainer page — see tech
stack doc §9 for the exact structure.

### Explainer Page — Functional Requirements

- **FR-17:** The app shall include a dedicated explainer page (route
  TBD by Claude Code, e.g. `/explainer` or `/about`) presenting the
  project's methodology in accessible, academic-adjacent language: what
  each of the three models forecasts, what data sources ground them, and
  — critically — the same Option A / precomputed-grid disclosure required
  by FR-12, explained in more depth here than the in-dashboard footnote
  allows room for.
- **FR-18:** The six visual assets in the table above shall be placed on
  this explainer page, each paired with the section explaining the concept
  it illustrates (per the mapping table). This page is the natural home
  for these assets — they should not be treated as decoration on the
  forecasting dashboard's functional views (charts/map), which stay
  focused on data rather than illustration, per the "lightweight but
  effective" principle in §6.
- **Navigation:** the portfolio profile page links to this explainer page
  as the entry point into the project — a visitor's first view of the
  project is expected to be the explainer page, not the live dashboard
  directly. The explainer page should itself link through to the working
  dashboard for visitors who want to interact with it.
