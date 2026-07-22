import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { RouteLineFeatureCollection } from "@/lib/types";

/**
 * GET /api/geo/routes.geojson?route=L&route=6&day_of_week=5
 *
 * Route-line map layer for the delay-risk view (FR-15). Reads
 * `route_shapes_geojson` (geometry, no model dependency - regenerated from
 * GTFS each ETL run, not tied to a model_run) and `forecast_delay_risk_latest`
 * (the value to color by, day-of-week dependent) and joins them here rather
 * than in a parameterized SQL view, since day_of_week is a query param.
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

  let shapesQuery = supabase
    .from("route_shapes_geojson")
    .select("route_id, shape_id, route_name, route_color, geom_geojson");
  if (routes.length > 0) {
    shapesQuery = shapesQuery.in("route_id", routes);
  }

  let riskQuery = supabase
    .from("forecast_delay_risk_latest")
    .select("route_id, p_incident, expected_delay_minutes, expected_degradation_pct, model_last_updated")
    .eq("day_of_week", dayOfWeek);
  if (routes.length > 0) {
    riskQuery = riskQuery.in("route_id", routes);
  }

  const [{ data: shapes, error: shapesError }, { data: risk, error: riskError }] = await Promise.all([
    shapesQuery,
    riskQuery,
  ]);

  if (shapesError) return NextResponse.json({ error: shapesError.message }, { status: 500 });
  if (riskError) return NextResponse.json({ error: riskError.message }, { status: 500 });

  const riskByRoute = new Map((risk ?? []).map((r) => [r.route_id, r]));
  const modelLastUpdated = risk?.[0]?.model_last_updated ?? null;

  const collection: RouteLineFeatureCollection = {
    type: "FeatureCollection",
    features: (shapes ?? []).map((shape) => {
      const riskRow = riskByRoute.get(shape.route_id);
      return {
        type: "Feature",
        geometry: shape.geom_geojson as { type: "LineString"; coordinates: [number, number][] },
        properties: {
          route_id: shape.route_id,
          route_name: shape.route_name,
          route_color: shape.route_color,
          shape_id: shape.shape_id,
          p_incident: riskRow?.p_incident ?? null,
          expected_delay_minutes: riskRow?.expected_delay_minutes ?? null,
          expected_degradation_pct: riskRow?.expected_degradation_pct ?? null,
        },
      };
    }),
    model_last_updated: modelLastUpdated,
  };

  return NextResponse.json(collection);
}
