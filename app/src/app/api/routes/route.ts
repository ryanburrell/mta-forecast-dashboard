import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// GET /api/routes - reference list for the parameter panel (FR-7).
export async function GET() {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("routes")
    .select("route_id, route_name, mode")
    .order("route_id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ routes: data ?? [] });
}
