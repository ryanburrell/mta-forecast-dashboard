import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { StationFeatureCollection } from "@/lib/types";

/**
 * GET /api/geo/stations.geojson?route=L&route=6&day_of_week=5
 *
 * Station-point map layer (FR-13/FR-14). Reads the `station_demand_latest`
 * SQL view (etl/sql/schema.sql), which already joins stations + the latest
 * Model 1 run and formats geometry with ST_AsGeoJSON - keeping this route
 * a thin passthrough (tech-stack doc §4/§13: favor SQL views over
 * application-layer joins).
 *
 * `route` filters stations down to ones served by any of the selected
 * routes, via the station_routes join table - same parameter state driving
 * both the chart and the map (FR-14, single source of truth).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const routes = searchParams.getAll("route");
  const dayOfWeekParam = searchParams.get("day_of_week");
  const dayOfWeek = dayOfWeekParam === null ? NaN : Number(dayOfWeekParam);

  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return NextResponse.json(
      { error: "day_of_week query param (0-6) is required" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServerClient();

  let stationIdFilter: string[] | null = null;
  if (routes.length > 0) {
    const { data: stationRoutes, error: stationRoutesError } = await supabase
      .from("station_routes")
      .select("station_complex_id")
      .in("route_id", routes);

    if (stationRoutesError) {
      return NextResponse.json({ error: stationRoutesError.message }, { status: 500 });
    }

    stationIdFilter = Array.from(new Set((stationRoutes ?? []).map((r) => r.station_complex_id)));

    if (stationIdFilter.length === 0) {
      const empty: StationFeatureCollection = {
        type: "FeatureCollection",
        features: [],
        model_last_updated: null,
      };
      return NextResponse.json(empty);
    }
  }

  let query = supabase
    .from("station_demand_latest")
    .select("station_complex_id, station_name, borough, forecast_ridership, geom_geojson, model_last_updated")
    .eq("day_of_week", dayOfWeek);

  if (stationIdFilter) {
    query = query.in("station_complex_id", stationIdFilter);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const collection: StationFeatureCollection = {
    type: "FeatureCollection",
    features: rows.map((row) => ({
      type: "Feature",
      geometry: row.geom_geojson as { type: "Point"; coordinates: [number, number] },
      properties: {
        station_complex_id: row.station_complex_id,
        station_name: row.station_name,
        borough: row.borough,
        forecast_ridership: row.forecast_ridership,
      },
    })),
    model_last_updated: rows[0]?.model_last_updated ?? null,
  };

  return NextResponse.json(collection);
}
