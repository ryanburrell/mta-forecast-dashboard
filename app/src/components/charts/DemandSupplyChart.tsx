import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DemandSupplyForecast } from "@/lib/types";

type Props = {
  forecasts: DemandSupplyForecast[];
  isLoading: boolean;
};

// FR-10 (Phase 1: demand-vs-supply only, no delay-risk view yet).
export default function DemandSupplyChart({ forecasts, isLoading }: Props) {
  if (isLoading) {
    return <div className="flex h-80 items-center justify-center text-sm text-zinc-500">Loading...</div>;
  }

  if (forecasts.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center text-sm text-zinc-500">
        No forecast data for this selection.
      </div>
    );
  }

  const data = forecasts.map((f) => ({
    route: f.route_id,
    Ridership: f.forecast_ridership === null ? null : Math.round(f.forecast_ridership),
    "Scheduled trips": f.forecast_scheduled_trips === null ? null : Math.round(f.forecast_scheduled_trips),
  }));

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
          <XAxis dataKey="route" fontSize={12} />
          <YAxis yAxisId="ridership" fontSize={12} />
          <YAxis yAxisId="trips" orientation="right" fontSize={12} />
          <Tooltip />
          <Legend />
          <Bar yAxisId="ridership" dataKey="Ridership" fill="#3b82f6" />
          <Bar yAxisId="trips" dataKey="Scheduled trips" fill="#a1a1aa" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
