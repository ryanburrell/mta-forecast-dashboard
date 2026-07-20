import type { ModelRunMeta } from "@/lib/types";

type Props = {
  modelRun: ModelRunMeta | null;
  isLoading: boolean;
};

// FR-16: surface the model's "last updated" timestamp from model_runs
// metadata, so viewers can see data freshness (Option A is precomputed,
// not real-time - see DisclosureFootnote).
export default function LastUpdated({ modelRun, isLoading }: Props) {
  if (isLoading) return null;

  if (!modelRun) {
    return (
      <p className="text-xs text-amber-700 dark:text-amber-400">
        No forecast data available yet - the ETL pipeline may not have run.
      </p>
    );
  }

  const formatted = new Date(modelRun.run_timestamp).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <p className="text-xs text-zinc-500">
      Forecast last updated {formatted} - trained on data from{" "}
      {modelRun.data_window_start} to {modelRun.data_window_end}.
    </p>
  );
}
