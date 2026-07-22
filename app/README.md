# App - Phase 1 + Phase 2 (dashboard)

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
- `src/app/api/geo/stations.geojson` - station points for the demand view's
  map, same query params (FR-13/FR-14) - reads the `station_demand_latest`
  SQL view
- `src/app/api/forecast/delay-risk` - Model 2 output (FR-5/FR-10), mirrors
  demand-supply
- `src/app/api/geo/routes.geojson` - route-line geometry for the delay-risk
  view's map (FR-15), joining `route_shapes_geojson` (reference data, no
  model dependency) with `forecast_delay_risk_latest` (day-of-week
  dependent) in the route handler rather than a parameterized SQL view
- `src/components/DashboardShell.tsx` - owns the `selectedRoutes` /
  `selectedDate` / `view` state that drives the chart and map together
  (FR-14)
- `src/components/ViewToggle.tsx` - switches between the demand and
  delay-risk views (FR-10/FR-13)
- `src/components/map/StationMap.tsx` vs. `RouteLinesMap.tsx` - points
  (demand) vs. lines (delay-risk); RouteLinesMap colors by the route's real
  MTA color and encodes risk via line weight/opacity instead of a
  color-value scale, since ~23 same-colored-by-risk lines sharing track in
  Manhattan would be indistinguishable - see its module comment
- `src/components/DisclosureFootnote.tsx` - the permanent FR-12 disclosure
- `src/components/LastUpdated.tsx` - FR-16 freshness timestamp, reads
  whichever model's run is active for the current view

## What's verified vs. not

Type-checked, linted, and built cleanly for both phases. Phase 1 was
verified end-to-end against live Supabase data and in production
(https://mta-forecast-dashboard.vercel.app/) via browser automation. Phase
2's app layer needs the same live verification pass before being
considered done - see the session notes / commit history for whether that
happened yet.
