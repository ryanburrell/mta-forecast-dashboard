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
          Delay-risk forecasts are based on observed public incident and delay-minutes
          history (MTA&apos;s own published &quot;Major Incidents&quot; and &quot;Customer
          Journey&quot; datasets), not actual fleet-maintenance records, which are not
          publicly available. &quot;Major incident&quot; is MTA&apos;s own definition (50+
          trains delayed) - this undercounts routine minor delays. Neither source has real
          day-of-week granularity: incident rates use a weekday/weekend split broadcast
          across the matching days, and delay-minutes are a single average that doesn&apos;t
          vary by day at all. Degradation % is a lower-bound estimate assuming each major
          incident delays exactly 50 trains (the qualifying threshold), not a fitted model.
        </li>
        <li>
          Holidays and known special events are excluded from the baseline demand training
          data. An event-scenario adjustment (planned) will approximate event impact using a
          precomputed coefficient, not a live event feed.
        </li>
        <li>
          Route-level ridership figures attribute each station&apos;s total ridership to
          every route serving it, so figures at transfer stations are not directly
          comparable to citywide totals. Similarly, the J/Z delay-risk figures are
          identical (the source data only reports them combined), and the W train&apos;s
          delay-risk figures are borrowed from the N train (the source data has no W
          entries at all - their incidents are historically reported under N).
        </li>
      </ul>
    </footer>
  );
}
