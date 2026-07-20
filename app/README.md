# App - Phase 1 (dashboard)

Next.js 16 (App Router), reading precomputed forecasts from Supabase. This
app never runs a model - every route in `src/app/api` is a thin, read-only
query layer (tech-stack doc §4/§6, "Option A").

> This Next.js version (16.2.10) postdates this assistant's training data.
> Before changing routing, data-fetching, or caching behavior, check
> `node_modules/next/dist/docs/` rather than assuming older-Next.js
> patterns - see `AGENTS.md`. Notably: `fetch` is *not* cached by default
> in this version (opposite of Next 13/14), and Client Components fetching
> data client-side should use `useSWR`/`use()`, not a raw `useEffect` +
> `setState` (the bundled `eslint-config-next` react-hooks rules will flag
> the latter - see `src/components/DashboardShell.tsx`).

## Setup

```
cd app
npm install
cp .env.local.example .env.local   # fill in NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

Both env vars are safe to expose to the browser (`NEXT_PUBLIC_` prefix) -
every Supabase table has RLS restricting the anon role to `SELECT` only
(`etl/sql/schema.sql`), and the ETL's service-role key never touches this
app.

## Structure

- `src/app/api/routes` - reference list of subway routes (FR-7)
- `src/app/api/forecast/demand-supply` - Model 1 output, filtered by
  `route` (repeatable) and `day_of_week` (FR-4/FR-10)
- `src/app/api/geo/stations.geojson` - station points for the map, same
  query params (FR-13/FR-14) - reads the `station_demand_latest` SQL view
- `src/components/DashboardShell.tsx` - owns the single `selectedRoutes` /
  `dayOfWeek` state that drives both the chart and the map (FR-14)
- `src/components/DisclosureFootnote.tsx` - the permanent FR-12 disclosure
- `src/components/LastUpdated.tsx` - FR-16 freshness timestamp

## What's verified vs. not

Type-checked, linted, and built cleanly. Exercised in a browser against a
placeholder Supabase URL to confirm the UI degrades gracefully (clear error
state, no crash) rather than to confirm real data renders - this
environment has no live Supabase project. Before treating Phase 1 as done,
someone with real Supabase credentials needs to:

1. Create a Supabase project, enable PostGIS, run `etl/sql/schema.sql`.
2. Run `python etl/run_pipeline.py --write-to-supabase` once.
3. Point `.env.local` (this app) and GitHub Actions secrets (the ETL
   workflow) at that project, then confirm the chart and map actually
   populate with real values end to end.
