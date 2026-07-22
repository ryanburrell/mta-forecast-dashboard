export type RouteRef = {
  route_id: string;
  route_name: string;
  route_color: string | null;
  mode: string;
};

export type ModelRunMeta = {
  id: number;
  run_timestamp: string;
  data_window_start: string;
  data_window_end: string;
};

export type DemandSupplyForecast = {
  route_id: string;
  day_of_week: number;
  forecast_ridership: number | null;
  forecast_scheduled_trips: number | null;
};

export type DemandSupplyResponse = {
  forecasts: DemandSupplyForecast[];
  model_run: ModelRunMeta | null;
};

export type StationFeatureProperties = {
  station_complex_id: string;
  station_name: string;
  borough: string;
  forecast_ridership: number | null;
};

export type StationFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: StationFeatureProperties;
  }>;
  model_last_updated: string | null;
};

export type DelayRiskForecast = {
  route_id: string;
  day_of_week: number;
  p_incident: number | null;
  expected_delay_minutes: number | null;
  expected_degradation_pct: number | null;
};

export type DelayRiskResponse = {
  forecasts: DelayRiskForecast[];
  model_run: ModelRunMeta | null;
};

export type RouteLineFeatureProperties = {
  route_id: string;
  route_name: string;
  route_color: string | null;
  shape_id: string;
  p_incident: number | null;
  expected_delay_minutes: number | null;
  expected_degradation_pct: number | null;
};

export type RouteLineFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "LineString"; coordinates: [number, number][] };
    properties: RouteLineFeatureProperties;
  }>;
  model_last_updated: string | null;
};

/** Which forecast the chart/map are currently showing (FR-10/FR-13). */
export type ForecastView = "demand" | "delay-risk";

/** 0=Monday .. 6=Sunday, matching the ETL's convention (etl/pull_mta_data.py). */
export const DAY_OF_WEEK_LABELS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
