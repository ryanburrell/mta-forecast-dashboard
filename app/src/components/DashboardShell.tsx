"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import ParameterPanel from "@/components/parameter-panel/ParameterPanel";
import DemandSupplyChart from "@/components/charts/DemandSupplyChart";
import LastUpdated from "@/components/LastUpdated";
import DisclosureFootnote from "@/components/DisclosureFootnote";
import { toModelDayOfWeek } from "@/lib/date";
import type { DemandSupplyResponse, RouteRef, StationFeatureCollection } from "@/lib/types";

// Leaflet touches `window` at import time, so the map can only render on the
// client - ssr:false keeps it out of the server-rendered HTML entirely
// (tech-stack doc §3: react-leaflet).
const StationMap = dynamic(() => import("@/components/map/StationMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[400px] items-center justify-center text-sm text-zinc-500">
      Loading map...
    </div>
  ),
});

const DEFAULT_ROUTES = ["L"]; // matches the PRD's own example scenario (§5)
// A fixed Saturday, not `nextSaturdayFrom(new Date())` - computing "today"
// client-side would make the initial render depend on wall-clock time,
// which can mismatch between server-render and client-hydration (different
// timezones/instants) and trigger a hydration warning. The date picker is
// fully functional regardless of how stale this default gets.
const DEFAULT_DATE = new Date(2026, 6, 25); // Saturday

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request to ${url} failed with ${res.status}`);
  return res.json();
};

function buildQuery(routes: string[], dayOfWeek: number): string {
  const params = new URLSearchParams();
  routes.forEach((r) => params.append("route", r));
  params.set("day_of_week", String(dayOfWeek));
  return params.toString();
}

export default function DashboardShell() {
  const [selectedRoutes, setSelectedRoutes] = useState<string[]>(DEFAULT_ROUTES);
  const [selectedDate, setSelectedDate] = useState<Date>(DEFAULT_DATE);

  const { data: routesData } = useSWR<{ routes: RouteRef[] }>("/api/routes", fetcher);

  const dayOfWeek = toModelDayOfWeek(selectedDate);
  const query = buildQuery(selectedRoutes, dayOfWeek);
  const {
    data: demandSupply,
    isLoading: isDemandSupplyLoading,
    error: demandSupplyError,
  } = useSWR<DemandSupplyResponse>(`/api/forecast/demand-supply?${query}`, fetcher);
  const { data: stationsGeojson, error: geojsonError } = useSWR<StationFeatureCollection>(
    `/api/geo/stations.geojson?${query}`,
    fetcher
  );

  const error = demandSupplyError || geojsonError;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 max-w-6xl mx-auto w-full">
      <header>
        <h1 className="text-2xl font-semibold">NYC Subway Demand Forecast</h1>
        <p className="text-sm text-zinc-500">
          Forecasted ridership vs. scheduled service, by route and date.
        </p>
      </header>

      <ParameterPanel
        availableRoutes={routesData?.routes ?? []}
        selectedRoutes={selectedRoutes}
        onSelectedRoutesChange={setSelectedRoutes}
        selectedDate={selectedDate}
        onSelectedDateChange={setSelectedDate}
      />

      {error && (
        <div className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          Could not load forecast data. Is Supabase reachable and populated?
        </div>
      )}

      <LastUpdated modelRun={demandSupply?.model_run ?? null} isLoading={isDemandSupplyLoading} />

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Demand vs. supply
          </h2>
          <DemandSupplyChart forecasts={demandSupply?.forecasts ?? []} isLoading={isDemandSupplyLoading} />
        </div>
        <div className="rounded border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Station demand
          </h2>
          <StationMap geojson={stationsGeojson ?? null} />
        </div>
      </section>

      <DisclosureFootnote />
    </div>
  );
}
