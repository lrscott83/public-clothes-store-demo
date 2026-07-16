import { Link } from 'react-router';
import type { Route } from './+types/home';
import { HERO, TOUR, VIEWS, CLOSING } from '../data/overview';

export function meta(_args: Route.MetaArgs) {
  return [
    { title: 'Sales Ops Cockpit' },
    {
      name: 'description',
      content:
        'Tu cuadro de mando (dashboard): en 5 segundos ves cuánto dinero entra, cuánto le debés a tus gestores y qué te queda limpio.',
    },
  ];
}

/**
 * Home / overview landing, rendered inside the `_shell` layout (sidebar stays
 * visible). Prospect-facing: states the MVP thesis, offers a suggested demo
 * path, and summarizes every view. Copy + metadata live in app/data/overview.ts.
 *
 * Design: warm-paper canvas with the brand violet as the single accent on light
 * surfaces — restyles the existing sections; adds no new elements.
 */
export default function Home() {
  return (
    <div className="min-h-full bg-[#F5F1E8] text-[#1B140B]">
      <div className="mx-auto max-w-6xl px-6 py-10 md:px-10 md:py-16">
        {/* Hero — the thesis. */}
        <section className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#673AB7]">
            {HERO.eyebrow}
          </p>
          <h1 className="mt-5 text-3xl font-extrabold leading-[1.05] tracking-tight text-[#1B140B] md:text-[3.25rem]">
            {HERO.headline}{' '}
            <span className="text-[#673AB7]">{HERO.headlineAccent}</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-[#6B6154] md:text-lg">
            {HERO.subhead}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link
              to={HERO.primaryCta.path}
              className="inline-flex items-center gap-2 rounded-sm bg-[#673AB7] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#5E35B1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#673AB7] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F5F1E8]"
            >
              {HERO.primaryCta.label}
              <span aria-hidden>→</span>
            </Link>
            <Link
              to={HERO.secondaryCta.path}
              className="text-sm font-medium text-[#6B6154] underline-offset-4 transition-colors hover:text-[#673AB7] hover:underline"
            >
              {HERO.secondaryCta.label}
            </Link>
          </div>
        </section>

        {/* Suggested tour — a real ordered path, so the numbering earns its place. */}
        <section className="mt-20">
          <div className="flex items-baseline gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1B140B]">
              Recorrido sugerido
            </h2>
            <span className="h-px flex-1 bg-[#1B140B]/10" aria-hidden />
          </div>
          <ol className="mt-6 grid gap-px overflow-hidden rounded-sm border border-[#1B140B]/12 bg-[#1B140B]/10 sm:grid-cols-3">
            {TOUR.map((step) => {
              const Icon = step.icon;
              return (
                <li key={step.n}>
                  <Link
                    to={step.path}
                    className="group flex h-full flex-col bg-[#FBF9F3] p-6 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#673AB7]"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold tabular-nums tracking-widest text-[#673AB7]">
                        {step.n}
                      </span>
                      <span className="h-px flex-1 bg-[#673AB7]/25" aria-hidden />
                      <Icon className="h-5 w-5 text-[#673AB7]" aria-hidden />
                    </div>
                    <h3 className="mt-5 text-lg font-bold text-[#1B140B]">{step.label}</h3>
                    <p className="mt-1 text-sm font-semibold text-[#673AB7]">{step.question}</p>
                    <p className="mt-3 text-sm leading-relaxed text-[#6B6154]">{step.summary}</p>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Every view, summarized — quiet and dense on purpose. */}
        <section className="mt-16">
          <div className="flex items-baseline gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1B140B]">
              Todas las vistas
            </h2>
            <span className="h-px flex-1 bg-[#1B140B]/10" aria-hidden />
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {VIEWS.map((view) => {
              const Icon = view.icon;
              return (
                <Link
                  key={`${view.label}-${view.path}`}
                  to={view.path}
                  className="group flex gap-3 rounded-sm border border-[#1B140B]/10 bg-[#FBF9F3] p-4 transition-colors hover:border-[#673AB7] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#673AB7]"
                >
                  <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-[#EDE7F6] text-[#673AB7] transition-colors group-hover:bg-[#673AB7] group-hover:text-white">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-[#1B140B]">{view.label}</span>
                    <span className="mt-0.5 block text-sm leading-relaxed text-[#6B6154]">
                      {view.summary}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Closing nudge. */}
        <p className="mt-16 border-l-2 border-[#673AB7] bg-[#EDE7F6]/60 px-6 py-5 text-sm leading-relaxed text-[#1B140B]">
          {CLOSING}
        </p>
      </div>
    </div>
  );
}
