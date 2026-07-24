import Image from "next/image";
import Link from "next/link";

// FR-17/FR-18: academic explainer page - the project's entry point (linked
// from the portfolio profile page externally), explaining methodology to a
// general/academic audience. Copy below is transcribed verbatim from PRD
// §16 (reviewed and approved as-is, not paraphrased) - do not silently
// edit it; flag anything that looks wrong instead. Section structure and
// image placement are per PRD §15's resolved mapping table.
export default function ExplainerPage() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="relative h-[50vh] min-h-[320px] w-full">
        <Image
          src="/explainer/transit-map-hero.jpeg"
          alt="Abstract composition of subway route lines intersecting with forecast waveforms"
          fill
          priority
          className="object-cover"
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 px-6 text-center text-white">
          <h1 className="max-w-2xl text-3xl font-semibold sm:text-4xl">
            Forecasting the NYC Subway
          </h1>
          <p className="mt-3 max-w-xl text-sm text-zinc-200 sm:text-base">
            How this project models demand, service reliability, and crowding risk from
            public MTA data.
          </p>
          <Link
            href="/"
            className="mt-6 rounded bg-white px-5 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
          >
            Try the live dashboard &rarr;
          </Link>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-16 p-6 py-16">
        <section>
          <div className="relative mb-6 aspect-[1376/768] w-full overflow-hidden rounded">
            <Image
              src="/explainer/two-lines-equilibrium.jpeg"
              alt="Two glowing curves intersecting at a single point"
              fill
              className="object-cover"
            />
          </div>
          <p className="text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
            This project forecasts subway demand, service reliability, and crowding risk
            across the New York City subway system, using only data the MTA and the City
            of New York already publish openly. Rather than modeling a single number, it
            treats transit capacity as what it actually is — a balance between how many
            people want to travel and how much service is realistically available to
            carry them, a balance that public schedules alone don&apos;t capture.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Model 1 — Baseline Demand &amp; Supply</h2>
          <div className="relative my-6 aspect-[1376/768] w-full overflow-hidden rounded">
            <Image
              src="/explainer/balance-beam.jpeg"
              alt="Abstract balance beam weighted unevenly on either side"
              fill
              className="object-cover"
            />
          </div>
          <p className="text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
            For a given subway route and day of the week, this model forecasts two
            figures side by side: expected ridership (demand) and expected scheduled
            service (supply), under ordinary conditions — explicitly excluding holidays
            and known city-wide events, which are treated separately. Demand is grounded
            in the MTA&apos;s own hourly station-entry data; supply is grounded in the
            MTA&apos;s published GTFS schedule feed.
          </p>
          <div className="relative my-6 aspect-[1376/768] w-full overflow-hidden rounded">
            <Image
              src="/explainer/wavy-lines-baseline.jpeg"
              alt="One highlighted wavy line tracking a baseline against surrounding variance"
              fill
              className="object-cover"
            />
          </div>
          <p className="text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
            The baseline method compares a given day against its own historical pattern —
            the same day of the week, averaged over recent weeks — a deliberately simple
            starting point that is often surprisingly hard to beat for transit, where
            day-of-week is the dominant driver of ridership patterns.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">How It&apos;s Built</h2>
          <div className="relative my-6 aspect-[1376/768] w-full overflow-hidden rounded">
            <Image
              src="/explainer/ribbons-pipeline.jpeg"
              alt="Tangled, multi-colored ribbons untangling into parallel organized lines"
              fill
              className="object-cover"
            />
          </div>
          <p className="text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
            None of these forecasts exist in the MTA&apos;s raw data as published —
            ridership counts, delay records, and schedule feeds are separate datasets, in
            separate formats, on separate update schedules. A scheduled pipeline pulls
            each of them, reconciles them onto a common route/day-of-week structure, and
            writes the resulting forecasts to a database the dashboard reads from
            directly.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Model 2 — Delay &amp; Service-Reliability Forecast</h2>
          <p className="mt-6 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
            This model forecasts how often service disruptions are likely to occur on a
            given route and day of the week, and how severe they tend to be once they
            happen — translated into an expected reduction in realized service relative
            to what&apos;s scheduled. It&apos;s grounded in the MTA&apos;s own published
            incident records. One limitation worth stating plainly: the MTA&apos;s public
            incident data only captures major incidents — those delaying 50 or more
            trains — so this forecast reflects large-scale disruption risk, not the full
            universe of minor day-to-day delays.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Model 3 — Crowding Risk</h2>
          <div className="relative my-6 aspect-[1376/768] w-full overflow-hidden rounded">
            <Image
              src="/explainer/crowd-train-imbalance.jpeg"
              alt="A crowd sized against a train's limited capacity"
              fill
              className="object-cover"
            />
          </div>
          <p className="text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
            This model estimates the likelihood that a given station will exceed a
            defined crowding threshold on a given day of the week, and includes an
            optional adjustment for nearby permitted city events — a concert or parade
            near a station measurably changes expected ridership there, and this model is
            the one place in the project that accounts for that directly rather than
            treating it as noise.
          </p>
        </section>

        <section className="border-t border-zinc-200 pt-10 dark:border-zinc-800">
          <h2 className="text-xl font-semibold">A Note on How This Works Under the Hood</h2>
          <p className="mt-6 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
            Forecasts on this dashboard are precomputed on a recurring schedule, not
            calculated live each time you change a filter. This was a deliberate choice —
            the realistic range of route/day-of-week/scenario combinations is small
            enough that precomputing all of them costs little in practice, while keeping
            the application itself simple, fast, and inexpensive to run. The tradeoff is
            that this dashboard can&apos;t yet answer arbitrary novel what-if questions
            the way a live-inference system could — that would be a reasonable next
            iteration of this project, not something this version attempts.
          </p>
        </section>

        <div className="flex justify-center border-t border-zinc-200 pt-10 dark:border-zinc-800">
          <Link
            href="/"
            className="rounded bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Try the live dashboard &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
