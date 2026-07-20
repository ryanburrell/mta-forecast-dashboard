import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client for Route Handlers. Uses the public anon key
 * (RLS on every table restricts it to SELECT only - see etl/sql/schema.sql)
 * because that's the only key this app ever has access to. Writes happen
 * exclusively from the Python ETL job using the service-role key, which
 * never reaches this codebase (tech-stack doc §4/§10).
 */
export function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables"
    );
  }

  return createClient(url, anonKey, { auth: { persistSession: false } });
}
