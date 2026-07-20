// FR-12: permanent, visible disclosure of this product's architectural and
// data limitations. Not optional polish - a stated functional requirement.
export default function DisclosureFootnote() {
  return (
    <footer className="mt-4 border-t border-zinc-200 pt-4 text-xs leading-relaxed text-zinc-500 dark:border-zinc-800">
      <p className="font-medium text-zinc-600 dark:text-zinc-400">About these forecasts</p>
      <ul className="mt-1 list-disc space-y-1 pl-4">
        <li>
          Forecasts are precomputed on a daily schedule, not calculated live from your
          selections. A live-inference architecture would better support true what-if
          analysis, but was intentionally deferred for this project&apos;s scope.
        </li>
        <li>
          Delay-risk forecasts (planned) are based on observed public delay/incident history,
          not actual MTA fleet-maintenance records, which are not publicly available.
        </li>
        <li>
          Holidays and known special events are excluded from the baseline training data.
          An event-scenario adjustment (planned) will approximate event impact using a
          precomputed coefficient, not a live event feed.
        </li>
        <li>
          Route-level ridership figures attribute each station&apos;s total ridership to
          every route serving it, so figures at transfer stations are not directly
          comparable to citywide totals.
        </li>
      </ul>
    </footer>
  );
}
