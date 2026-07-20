# ETL - Phase 1 (Model 1: baseline demand & supply)

Standalone Python pipeline, decoupled from the Next.js app (tech-stack doc
§9/§13). Pulls MTA hourly ridership + GTFS static, excludes holidays, runs
Model 1, and writes precomputed forecast tables to Supabase.

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
python run_pipeline.py --training-window-days 84
```

Each module is also independently runnable for debugging, e.g.
`python pull_mta_data.py`, `python pull_gtfs.py`, `python pull_holidays.py`,
`python model_1_demand_supply.py`.

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
- **Model 2 blocker still open**: `mta_subway_major_incidents` (uqnw-2qfk)
  returned `403 - must be logged in` when checked during Phase 1
  development, despite being marked "confirmed to exist" in the data
  sources config. Not a Phase 1 blocker (Model 2 is Phase 2), but resolve
  this before starting Model 2 work.
