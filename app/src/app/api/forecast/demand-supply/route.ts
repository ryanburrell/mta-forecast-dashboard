import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /api/forecast/demand-supply?route=L&route=6&day_of_week=5
 *
 * Model 1 (FR-4/FR-10, demand vs. supply). Always reads the *latest* model_1
 * run - forecast rows are never mutated in place, only appended with a new
 * model_run_id (etl/write_to_supabase.py), so "latest run" is always the
 * freshest good snapshot even if a scheduled ETL run fails (NFR-5).
 *
 * `route` may repeat for a multi-route selection (FR-7); omit it to return
 * every route for the given day_of_week.
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

  const { data: run, error: runError } = await supabase
    .from("model_runs")
    .select("id, run_timestamp, data_window_start, data_window_end")
    .eq("model_name", "model_1")
    .order("run_timestamp", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (runError) {
    return NextResponse.json({ error: runError.message }, { status: 500 });
  }
  if (!run) {
    return NextResponse.json({ forecasts: [], model_run: null });
  }

  let query = supabase
    .from("forecast_demand_supply")
    .select("route_id, day_of_week, forecast_ridership, forecast_scheduled_trips")
    .eq("model_run_id", run.id)
    .eq("day_of_week", dayOfWeek);

  if (routes.length > 0) {
    query = query.in("route_id", routes);
  }

  const { data, error } = await query.order("route_id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ forecasts: data ?? [], model_run: run });
}
