-- MTA Forecasting Dashboard - Supabase schema, Phase 1 + Phase 2.
-- Companion to tech-stack-mta-forecasting-dashboard.md §7 (data model) and §4
-- (backend/data layer). Phase 1 covers FR-1..4, FR-7, FR-8, FR-10 (demand/
-- supply), FR-13, FR-14, FR-12, FR-16. Phase 2 adds FR-5 (delay risk) and
-- FR-15 (route-line geometry). Model 3 (forecast_crowding_risk) is still
-- deferred to Phase 3.
--
-- This file is safe to re-run against an already-provisioned Phase 1
-- database - new tables use "create table if not exists", and the one new
-- column on an existing table uses "add column if not exists" below.
--
-- Run once against a fresh Supabase project (PostGIS enabled at project
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
-- Phase 2: official MTA line color (from GTFS routes.txt), e.g. '#00933C', for
-- coloring the route-line map layer (FR-15) consistently with real signage.
alter table routes add column if not exists route_color text;

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
-- Phase 2: route-line geometry (FR-15). Reference data (not a model output,
-- no model_run_id) - regenerated from GTFS shapes.txt each ETL run via
-- upsert-by-key, same as `stations`. A route can have multiple shapes
-- (branches/directions/express variants) - kept as separate rows rather
-- than merged into one line, so the map renders each accurately.
-- ============================================================================

create table if not exists route_shapes (
  route_id  text not null references routes(route_id),
  shape_id  text not null,
  geom      geography(LineString, 4326) not null,
  primary key (route_id, shape_id)
);
create index if not exists route_shapes_geom_idx on route_shapes using gist (geom);

create or replace view route_shapes_geojson as
select
  rs.route_id,
  rs.shape_id,
  r.route_name,
  r.route_color,
  st_asgeojson(rs.geom)::json as geom_geojson
from route_shapes rs
join routes r on r.route_id = rs.route_id;

-- ============================================================================
-- Phase 2: Model 2 output - route-level delay risk (FR-5).
-- p_incident: expected major incidents/day (not a 0-1 probability - can
-- exceed 1 on the highest-incident routes/weekdays; see
-- model_2_delay_risk.py for exact derivation and its disclosed caveats).
-- ============================================================================

create table if not exists forecast_delay_risk (
  id                         bigserial primary key,
  route_id                   text not null references routes(route_id),
  day_of_week                smallint not null check (day_of_week between 0 and 6),
  p_incident                 numeric,
  expected_delay_minutes     numeric,
  expected_degradation_pct   numeric,
  model_run_id               bigint not null references model_runs(id),
  unique (route_id, day_of_week, model_run_id)
);
create index if not exists forecast_delay_risk_lookup_idx on forecast_delay_risk (route_id, day_of_week);

create or replace view forecast_delay_risk_latest as
select
  fdr.route_id,
  fdr.day_of_week,
  fdr.p_incident,
  fdr.expected_delay_minutes,
  fdr.expected_degradation_pct,
  mr.run_timestamp as model_last_updated,
  mr.data_window_start,
  mr.data_window_end
from forecast_delay_risk fdr
join model_runs mr on mr.id = fdr.model_run_id
where fdr.model_run_id = (
  select id from model_runs where model_name = 'model_2' order by run_timestamp desc limit 1
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
alter table route_shapes enable row level security;
alter table forecast_delay_risk enable row level security;

drop policy if exists anon_select_routes on routes;
create policy anon_select_routes on routes for select to anon using (true);

drop policy if exists anon_select_stations on stations;
create policy anon_select_stations on stations for select to anon using (true);

drop policy if exists anon_select_route_shapes on route_shapes;
create policy anon_select_route_shapes on route_shapes for select to anon using (true);

drop policy if exists anon_select_forecast_delay_risk on forecast_delay_risk;
create policy anon_select_forecast_delay_risk on forecast_delay_risk for select to anon using (true);

drop policy if exists anon_select_station_routes on station_routes;
create policy anon_select_station_routes on station_routes for select to anon using (true);

drop policy if exists anon_select_model_runs on model_runs;
create policy anon_select_model_runs on model_runs for select to anon using (true);

drop policy if exists anon_select_forecast_demand_supply on forecast_demand_supply;
create policy anon_select_forecast_demand_supply on forecast_demand_supply for select to anon using (true);

drop policy if exists anon_select_station_demand on station_demand;
create policy anon_select_station_demand on station_demand for select to anon using (true);
