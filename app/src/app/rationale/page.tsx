import Image from "next/image";
import Link from "next/link";

// Static content page - no data fetching, no client interactivity needed.
// Explains the "why" behind each forecast's design, complementing the
// in-dashboard disclosure footnote's "what/how" (DisclosureFootnote.tsx).
// Draft copy - text is expected to be refined after a first review pass.
export default function RationalePage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 p-6">
      <header>
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          &larr; Back to dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Why these forecasts are built this way</h1>
        <p className="mt-2 text-sm text-zinc-500">
          The dashboard&apos;s disclosure footnote covers what each forecast does and doesn&apos;t
          account for. This page is the reasoning behind the design decisions - why each forecast
          exists in this shape, not just what it computes.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Demand &amp; capacity</h2>
        <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          The demand and capacity forecast exists to answer a simple question: on a given route
          and day, how does expected ridership compare to how much service is actually
          scheduled? Rather than building a live-inference system that recomputes a forecast on
          every request, this project deliberately precomputes a full grid of route x
          day-of-week combinations ahead of time - the parameter space is small and enumerable,
          so nothing meaningful is lost, while the app itself stays a thin, fast query layer with
          no model runtime in the request path. The forecast itself is intentionally simple: a
          seasonal-naive average of recent, non-holiday ridership by day-of-week, paired with
          GTFS&apos;s actual published schedule for that same day. That simplicity is a judgment
          call, not a shortcut being hidden - a fitted seasonal or regression model would chase a
          level of precision the underlying data (a rolling few weeks of recent history) can&apos;t
          really support, without changing the story the dashboard is trying to tell: how demand
          and scheduled supply move together, or don&apos;t, across the week.
        </p>
        <Image
          src="/rationale/demand-capacity.png"
          alt="Demand vs. supply chart and station map, showing the L train on a Saturday"
          width={1038}
          height={650}
          className="w-full rounded border border-zinc-200 dark:border-zinc-800"
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Delay risk</h2>
        <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          The delay-risk forecast exists to answer a different question: given how
          disruption-prone a route has historically been, how much of its scheduled service is
          genuinely at risk on a given day? No single MTA dataset answers that directly, so this
          forecast deliberately combines two independently-sourced, imperfect public metrics - a
          count of major service incidents and a measure of extra minutes riders actually
          experience - rather than waiting for a single perfect source that doesn&apos;t exist.
          Where the two sources disagreed on granularity (one splits weekday/weekend, the other
          splits peak/off-peak, and neither has real per-day data) or on route labeling (combined
          shuttle names, a combined J/Z figure, no entry at all for the W train), the response was
          to make an explicit, disclosed choice rather than silently picking whichever number
          looked cleanest. The headline &quot;expected degradation&quot; percentage is
          deliberately a transparent, back-of-envelope calculation grounded in MTA&apos;s own
          published definition of a major incident, not a fitted statistical model - a defensible
          lower bound is more honest than false precision from a model with no real training
          signal behind it.
        </p>
        <Image
          src="/rationale/delay-risk.png"
          alt="Delay risk chart and route-line map, showing the L train on a Saturday"
          width={1038}
          height={650}
          className="w-full rounded border border-zinc-200 dark:border-zinc-800"
        />
      </section>
    </div>
  );
}
