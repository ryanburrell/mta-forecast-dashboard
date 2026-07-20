import type { RouteRef } from "@/lib/types";
import { DAY_OF_WEEK_LABELS } from "@/lib/types";

type Props = {
  availableRoutes: RouteRef[];
  selectedRoutes: string[];
  onSelectedRoutesChange: (routes: string[]) => void;
  dayOfWeek: number;
  onDayOfWeekChange: (dayOfWeek: number) => void;
};

// FR-7 (route selection, one or more) + FR-8 (day-of-week selection).
export default function ParameterPanel({
  availableRoutes,
  selectedRoutes,
  onSelectedRoutesChange,
  dayOfWeek,
  onDayOfWeekChange,
}: Props) {
  function toggleRoute(routeId: string) {
    if (selectedRoutes.includes(routeId)) {
      onSelectedRoutesChange(selectedRoutes.filter((r) => r !== routeId));
    } else {
      onSelectedRoutesChange([...selectedRoutes, routeId]);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded border border-zinc-200 p-4 dark:border-zinc-800">
      <div>
        <div className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Routes {selectedRoutes.length === 0 && <span className="text-zinc-400">(all)</span>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {availableRoutes.map((route) => {
            const selected = selectedRoutes.includes(route.route_id);
            return (
              <button
                key={route.route_id}
                type="button"
                onClick={() => toggleRoute(route.route_id)}
                aria-pressed={selected}
                title={route.route_name}
                className={`h-8 w-8 rounded-full text-sm font-semibold transition-colors ${
                  selected
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                }`}
              >
                {route.route_id}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label htmlFor="day-of-week" className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Day of week
        </label>
        <select
          id="day-of-week"
          value={dayOfWeek}
          onChange={(e) => onDayOfWeekChange(Number(e.target.value))}
          className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {DAY_OF_WEEK_LABELS.map((label, index) => (
            <option key={label} value={index}>
              {label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
