-- MTA Forecasting Dashboard - Supabase schema, Phase 1 subset.
-- Companion to tech-stack-mta-forecasting-dashboard.md §7 (data model) and §4
-- (backend/data layer). Only tables needed for Phase 1 (PRD §11: FR-1..4,
-- FR-7, FR-8, FR-10 demand/supply, FR-13, FR-14, FR-12, FR-16) are created
-- here. Model 2 / Model 3 tables (forecast_delay_risk, forecast_crowding_risk,
-- route_shapes) are deferred to their respective phases, not created yet.
--
-- Run this once against a fresh Supabase project (PostGIS enabled at project
-- creation per tech-stack doc §4).

create extension if not exists postgis;

-- ============================================================================
-- Reference tables
-- ============================================================================

create table if not exists routes (
  route_id   text primary key,   -- rider-facing label, e.g. '6', 'L', 'S' (combined shuttle)
  route_name text not null,
  mode       text not null default 'subway'  -- always 'subway' in v1 (PRD NG2); kept for future bus/LIRR/etc.
);

create table if not exists stations (
  station_complex_id text primary key,
  station_name        text not null,
  borough              text not null,
  geom                 geography(Point, 4326) not null
);
create index if not exists stations_geom_idx on stations using gist (geom);

-- Which routes serve which stations (parsed from the ridership dataset's own
-- station_complex labels - see etl/lib/route_labels.py). Not in the
-- tech-stack doc's original schema; added so the map (FR-13/14) can filter
-- station points down to the routes selected in the parameter panel.
create table if not exists station_routes (
  station_complex_id text not null references stations(station_complex_id),
  route_id            text not null references routes(route_id),
  primary key (station_complex_id, route_id)
);

-- ============================================================================
-- Model run metadata (FR-16: "last updated" freshness per view)
-- ============================================================================

create table if not exists model_runs (
  id                 bigserial primary key,
  model_name         text not null,   -- 'model_1' | 'model_2' | 'model_3'
  run_timestamp      timestamptz not null default now(),
  data_window_start  date not null,
  data_window_end    date not null,
  notes              text
);
create index if not exists model_runs_model_name_ts_idx on model_runs (model_name, run_timestamp desc);

-- ============================================================================
-- Model 1 output - route-level demand vs. supply (FR-4)
-- ============================================================================

create table if not exists forecast_demand_supply (
  id                          bigserial primary key,
  route_id                    text not null references routes(route_id),
  day_of_week                 smallint not null check (day_of_week between 0 and 6),  -- 0=Monday .. 6=Sunday
  forecast_ridership          numeric,
  forecast_scheduled_trips    numeric,
  model_run_id                bigint not null references model_runs(id),
  unique (route_id, day_of_week, model_run_id)
);
create index if not exists forecast_demand_supply_lookup_idx on forecast_demand_supply (route_id, day_of_week);

-- ============================================================================
-- Model 1 output - station-level demand (Phase 1 schema extension, not in the
-- tech-stack doc's original table list). Needed for FR-13/14: the map colors
-- station points by the active forecast's value, and Phase 1's active
-- forecast is Model 1 demand. This is the same Model 1 computation at
-- station grain instead of route grain, tagged with the same model_run_id -
-- not a new model. See model_1_demand_supply.py module docstring.
-- ============================================================================

create table if not exists station_demand (
  id                   bigserial primary key,
  station_complex_id   text not null references stations(station_complex_id),
  day_of_week          smallint not null check (day_of_week between 0 and 6),
  forecast_ridership   numeric,
  model_run_id         bigint not null references model_runs(id),
  unique (station_complex_id, day_of_week, model_run_id)
);
create index if not exists station_demand_lookup_idx on station_demand (station_complex_id, day_of_week);

-- ============================================================================
-- Convenience view: latest Model 1 run's station demand as GeoJSON-ready rows.
-- Keeps the Next.js API route thin (tech-stack doc §4/§13 - favor SQL views
-- over application-layer joins).
-- ============================================================================

create or replace view station_demand_latest as
select
  sd.station_complex_id,
  s.station_name,
  s.borough,
  sd.day_of_week,
  sd.forecast_ridership,
  st_asgeojson(s.geom)::json as geom_geojson,
  mr.run_timestamp as model_last_updated
from station_demand sd
join stations s on s.station_complex_id = sd.station_complex_id
join model_runs mr on mr.id = sd.model_run_id
where sd.model_run_id = (
  select id from model_runs where model_name = 'model_1' order by run_timestamp desc limit 1
);

-- ============================================================================
-- Row Level Security (tech-stack doc §10): anon role gets SELECT only.
-- All writes happen exclusively via the service-role key from the Python ETL
-- job (etl/write_to_supabase.py), never from the Next.js app.
-- ============================================================================

alter table routes enable row level security;
alter table stations enable row level security;
alter table station_routes enable row level security;
alter table model_runs enable row level security;
alter table forecast_demand_supply enable row level security;
alter table station_demand enable row level security;

drop policy if exists anon_select_routes on routes;
create policy anon_select_routes on routes for select to anon using (true);

drop policy if exists anon_select_stations on stations;
create policy anon_select_stations on stations for select to anon using (true);

drop policy if exists anon_select_station_routes on station_routes;
create policy anon_select_station_routes on station_routes for select to anon using (true);

drop policy if exists anon_select_model_runs on model_runs;
create policy anon_select_model_runs on model_runs for select to anon using (true);

drop policy if exists anon_select_forecast_demand_supply on forecast_demand_supply;
create policy anon_select_forecast_demand_supply on forecast_demand_supply for select to anon using (true);

drop policy if exists anon_select_station_demand on station_demand;
create policy anon_select_station_demand on station_demand for select to anon using (true);
