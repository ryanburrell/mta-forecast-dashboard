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
  FR-14, FR-12, FR-16.
- Acceptance: a user can select a route + day-of-week and see forecasted
  demand vs. supply as both a chart and a station-point map.

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
