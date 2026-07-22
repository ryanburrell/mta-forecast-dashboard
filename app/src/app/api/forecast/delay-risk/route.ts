import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /api/forecast/delay-risk?route=L&route=6&day_of_week=5
 *
 * Model 2 (FR-5/FR-10, delay risk). Mirrors /api/forecast/demand-supply -
 * always reads the latest model_2 run, `route` may repeat, omitting it
 * returns every route for the given day_of_week.
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
    .eq("model_name", "model_2")
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
    .from("forecast_delay_risk")
    .select("route_id, day_of_week, p_incident, expected_delay_minutes, expected_degradation_pct")
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
