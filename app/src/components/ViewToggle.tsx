import type { ForecastView } from "@/lib/types";

type Props = {
  view: ForecastView;
  onViewChange: (view: ForecastView) => void;
};

const OPTIONS: { value: ForecastView; label: string }[] = [
  { value: "demand", label: "Demand vs. supply" },
  { value: "delay-risk", label: "Delay risk" },
];

// FR-10 (chart view switch) / FR-13 (map switches which forecast it colors
// stations or lines by, depending on the active view).
export default function ViewToggle({ view, onViewChange }: Props) {
  return (
    <div className="inline-flex rounded border border-zinc-300 p-0.5 dark:border-zinc-700" role="tablist">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={view === opt.value}
          onClick={() => onViewChange(opt.value)}
          className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
            view === opt.value
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
