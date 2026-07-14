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
 */
export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10 md:px-10 md:py-14">
      {/* Hero — the thesis: chaos (ink) resolving into order (primary). */}
      <section className="border-l-4 border-primary pl-5 md:pl-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          {HERO.eyebrow}
        </p>
        <h1 className="mt-4 max-w-3xl text-3xl font-extrabold leading-[1.08] tracking-tight text-text md:text-5xl">
          {HERO.headline}
          <br />
          <span className="text-primary">{HERO.headlineAccent}</span>
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-text-muted md:text-lg">
          {HERO.subhead}
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link
            to={HERO.primaryCta.path}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-white shadow-card transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            {HERO.primaryCta.label}
            <span aria-hidden>→</span>
          </Link>
          <Link
            to={HERO.secondaryCta.path}
            className="text-sm font-medium text-text-muted underline-offset-4 transition-colors hover:text-primary hover:underline"
          >
            {HERO.secondaryCta.label}
          </Link>
        </div>
      </section>

      {/* Suggested tour — a real ordered path (the demo choreography). */}
      <section className="mt-14">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
          Recorrido sugerido
        </h2>
        <ol className="mt-5 grid gap-4 sm:grid-cols-3">
          {TOUR.map((step) => {
            const Icon = step.icon;
            return (
              <li key={step.n}>
                <Link
                  to={step.path}
                  className="group relative flex h-full flex-col rounded-lg border border-border bg-surface p-5 shadow-card transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span
                    aria-hidden
                    className="absolute right-4 top-3 text-3xl font-extrabold text-primary/15 transition-colors group-hover:text-primary/25"
                  >
                    {step.n}
                  </span>
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary-light text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-text">{step.label}</h3>
                  <p className="mt-0.5 text-sm font-medium text-primary">{step.question}</p>
                  <p className="mt-2 text-sm leading-relaxed text-text-muted">{step.summary}</p>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Every view, summarized. */}
      <section className="mt-14">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
          Todas las vistas
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {VIEWS.map((view) => {
            const Icon = view.icon;
            return (
              <Link
                key={`${view.label}-${view.path}`}
                to={view.path}
                className="group flex gap-3 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-light text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-text">{view.label}</span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-text-muted">
                    {view.summary}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Closing nudge. */}
      <p className="mt-14 rounded-lg border border-border bg-primary-light/50 px-6 py-5 text-sm leading-relaxed text-text">
        {CLOSING}
      </p>
    </main>
  );
}
