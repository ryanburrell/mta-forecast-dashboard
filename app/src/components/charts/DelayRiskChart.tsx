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
import type { DelayRiskForecast } from "@/lib/types";

type Props = {
  forecasts: DelayRiskForecast[];
  isLoading: boolean;
};

// FR-10 (delay-risk view). p_incident is left out of the chart (it's an
// intermediate rate, not directly meaningful on its own) - degradation %
// and delay minutes/rider are the two headline numbers from FR-5.
export default function DelayRiskChart({ forecasts, isLoading }: Props) {
  if (isLoading) {
    return <div className="flex h-80 items-center justify-center text-sm text-zinc-500">Loading...</div>;
  }

  if (forecasts.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center text-sm text-zinc-500">
        No delay-risk data for this selection.
      </div>
    );
  }

  const data = forecasts.map((f) => ({
    route: f.route_id,
    "Degradation %": f.expected_degradation_pct === null ? null : Number(f.expected_degradation_pct.toFixed(2)),
    "Delay min/rider": f.expected_delay_minutes === null ? null : Number(f.expected_delay_minutes.toFixed(2)),
  }));

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
          <XAxis dataKey="route" fontSize={12} />
          <YAxis yAxisId="pct" fontSize={12} unit="%" />
          <YAxis yAxisId="minutes" orientation="right" fontSize={12} />
          <Tooltip />
          <Legend />
          <Bar yAxisId="pct" dataKey="Degradation %" fill="#dc2626" />
          <Bar yAxisId="minutes" dataKey="Delay min/rider" fill="#a1a1aa" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
