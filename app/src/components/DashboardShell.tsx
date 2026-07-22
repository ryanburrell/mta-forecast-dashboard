"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import ParameterPanel from "@/components/parameter-panel/ParameterPanel";
import DemandSupplyChart from "@/components/charts/DemandSupplyChart";
import DelayRiskChart from "@/components/charts/DelayRiskChart";
import ViewToggle from "@/components/ViewToggle";
import LastUpdated from "@/components/LastUpdated";
import DisclosureFootnote from "@/components/DisclosureFootnote";
import { toModelDayOfWeek } from "@/lib/date";
import type {
  DelayRiskResponse,
  DemandSupplyResponse,
  ForecastView,
  RouteLineFeatureCollection,
  RouteRef,
  StationFeatureCollection,
} from "@/lib/types";

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
const RouteLinesMap = dynamic(() => import("@/components/map/RouteLinesMap"), {
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
const DEFAULT_VIEW: ForecastView = "demand";

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
  const [view, setView] = useState<ForecastView>(DEFAULT_VIEW);

  const { data: routesData } = useSWR<{ routes: RouteRef[] }>("/api/routes", fetcher);

  const dayOfWeek = toModelDayOfWeek(selectedDate);
  const query = buildQuery(selectedRoutes, dayOfWeek);

  const {
    data: demandSupply,
    isLoading: isDemandSupplyLoading,
    error: demandSupplyError,
  } = useSWR<DemandSupplyResponse>(`/api/forecast/demand-supply?${query}`, fetcher);
  const { data: stationsGeojson, error: stationsGeojsonError } = useSWR<StationFeatureCollection>(
    `/api/geo/stations.geojson?${query}`,
    fetcher
  );

  const {
    data: delayRisk,
    isLoading: isDelayRiskLoading,
    error: delayRiskError,
  } = useSWR<DelayRiskResponse>(`/api/forecast/delay-risk?${query}`, fetcher);
  const { data: routesGeojson, error: routesGeojsonError } = useSWR<RouteLineFeatureCollection>(
    `/api/geo/routes.geojson?${query}`,
    fetcher
  );

  const error =
    view === "demand"
      ? demandSupplyError || stationsGeojsonError
      : delayRiskError || routesGeojsonError;
  const activeModelRun = view === "demand" ? demandSupply?.model_run ?? null : delayRisk?.model_run ?? null;
  const isActiveLoading = view === "demand" ? isDemandSupplyLoading : isDelayRiskLoading;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 max-w-6xl mx-auto w-full">
      <header>
        <h1 className="text-2xl font-semibold">NYC Subway Demand Forecast</h1>
        <p className="text-sm text-zinc-500">
          Forecasted ridership, scheduled service, and delay risk, by route and date.
        </p>
      </header>

      <ParameterPanel
        availableRoutes={routesData?.routes ?? []}
        selectedRoutes={selectedRoutes}
        onSelectedRoutesChange={setSelectedRoutes}
        selectedDate={selectedDate}
        onSelectedDateChange={setSelectedDate}
      />

      <ViewToggle view={view} onViewChange={setView} />

      {error && (
        <div className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          Could not load forecast data. Is Supabase reachable and populated?
        </div>
      )}

      <LastUpdated modelRun={activeModelRun} isLoading={isActiveLoading} />

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {view === "demand" ? "Demand vs. supply" : "Delay risk"}
          </h2>
          {view === "demand" ? (
            <DemandSupplyChart forecasts={demandSupply?.forecasts ?? []} isLoading={isDemandSupplyLoading} />
          ) : (
            <DelayRiskChart forecasts={delayRisk?.forecasts ?? []} isLoading={isDelayRiskLoading} />
          )}
        </div>
        <div className="rounded border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {view === "demand" ? "Station demand" : "Route delay risk"}
          </h2>
          {view === "demand" ? (
            <StationMap geojson={stationsGeojson ?? null} />
          ) : (
            <RouteLinesMap geojson={routesGeojson ?? null} />
          )}
        </div>
      </section>

      <DisclosureFootnote />
    </div>
  );
}
