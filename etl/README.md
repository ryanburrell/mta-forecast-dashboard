# ETL - Phase 1 + Phase 2

Standalone Python pipeline, decoupled from the Next.js app (tech-stack doc
§9/§13). Pulls MTA hourly ridership + GTFS static (Model 1: demand/supply)
and MTA incident/delay-minutes data + GTFS shapes (Model 2: delay risk +
route-line geometry), and writes precomputed forecast tables to Supabase.

## Setup

```
cd etl
python -m venv .venv && .venv\Scripts\activate   # or source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY for a live write
```

Apply `sql/schema.sql` once against a fresh Supabase project (PostGIS
extension enabled at project creation, per tech-stack doc §4).

## Running

```
python run_pipeline.py                        # dry run -> CSVs in output/
python run_pipeline.py --write-to-supabase     # writes to Supabase
python run_pipeline.py --training-window-days 84   # Model 1 window only
```

Runs Model 1 and Model 2 together, sharing one GTFS download. Each model
computes and writes independently - if one fails, the other's result still
gets written rather than being thrown away (see run_pipeline.py docstring).

Each module is also independently runnable for debugging, e.g.
`python pull_mta_data.py`, `python pull_gtfs.py`, `python pull_holidays.py`,
`python pull_incidents.py`, `python pull_delay_minutes.py`,
`python model_1_demand_supply.py`, `python model_2_delay_risk.py`.

## Notes on this dev machine

Local runs on this particular Windows machine need Avast's HTTPS-scanning
proxy either disabled for Python or trusted, since its locally-generated
CA cert fails OpenSSL 3.x's strict chain validation (unrelated to the
actual data sources - confirmed working with curl and directly verified
against live endpoints during development). GitHub Actions runners don't
have this proxy, so the scheduled workflow is unaffected.

## Design notes worth knowing before touching this code

- **Route grain**: the ridership dataset labels each station with the
  rider-facing route letters serving it (e.g. "Bowery (J,Z)"), which never
  distinguishes express variants and always labels all three shuttles "S".
  GTFS route_ids are collapsed to match (`lib/route_labels.py`) so both
  sides of Model 1 join on the same key. This means the "S" route in the
  output is Franklin Ave + 42 St + Rockaway Park shuttles combined.
- **Demand attribution double-counts transfer stations**: a station's
  ridership is attributed in full to every route serving it, since the
  source data has no way to split a station-level entry count across the
  specific route a rider used. This is a disclosed simplification (PRD
  §6), not a bug - route-level `forecast_ridership` values are not
  directly comparable to citywide ridership totals.
- **station_demand table** isn't in the tech-stack doc's original schema.
  It's Model 1's same computation at station grain instead of route grain,
  added because FR-13/14 (station-point map colored by the active
  forecast) need a station-level value and Phase 1's only forecast is
  Model 1. See `model_1_demand_supply.py` module docstring.
- **Staten Island Railway is excluded**, not just unlabeled - PRD NG2 scopes
  this to subway only, and the ridership dataset itself tags SIR rows with
  a distinct `transit_mode`, which is the filter used.
- **Model 2's originally-planned incidents dataset (`uqnw-2qfk`) is auth-gated**
  (`403 authentication_required`, confirmed both during Phase 1 and again
  when Phase 2 started). `ereg-mcvp` is the actual public edition of the
  same "Major Incidents" series - found via Socrata's catalog search API
  (`api.us.socrata.com/api/catalog/v1`), not the original source list.
- **Two independent Model 2 data sources with different, incompatible
  granularities**: incidents (`ereg-mcvp`) split weekday/weekend only;
  delay-minutes (`r7qk-6tcy`) split peak/off-peak only, no weekday/weekend
  at all. Neither has real day-of-week data. `pull_incidents.py` broadcasts
  the weekday rate to Mon-Fri and weekend rate to Sat-Sun; delay-minutes is
  one ridership-weighted average that doesn't vary by day. Both disclosed
  in-product (FR-12).
- **Three different route-labeling conventions across sources**, all
  reconciled in `lib/route_labels.py`'s `incident_line_to_route_ids`:
  the incidents/delay-minutes datasets use "JZ" combined (duplicated to
  both J and Z rows here - the source can't say which was actually
  affected) and split shuttles into "S 42nd"/"S Rock"/"S Fkln" (aggregated
  into this project's combined "S", matching Model 1's convention).
- **The W train has zero rows in the incidents dataset's entire history**
  (verified directly, not assumed) - its incidents are historically
  reported under "N" (confirmed via a sibling dataset's column
  description: "N includes the W in November 2016-December 2016..."). W's
  incident rate is borrowed from N's rather than shown as a fabricated
  zero, which would misleadingly imply immunity to disruption.
- **expected_degradation_pct is a derived heuristic, not a fitted model**:
  MTA's own definition of "major incident" is 50+ trains delayed
  (`data-sources.config.json`), so `p_incident * 50 / scheduled_trips` is
  used as a lower-bound estimate of service degradation - see
  `model_2_delay_risk.py` docstring.
