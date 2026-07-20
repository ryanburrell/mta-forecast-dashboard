export type RouteRef = {
  route_id: string;
  route_name: string;
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
