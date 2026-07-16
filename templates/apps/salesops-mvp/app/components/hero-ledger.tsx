import { useEffect, useRef, useState } from 'react';
import { HERO_LEDGER } from '../data/overview';

/**
 * The home hero's signature element: the product thesis made literal. On a warm
 * ink canvas, the money-flow resolves into one aligned ledger — sales in
 * (neutral), what leaves (terracotta), and what stays clean (violet). Figures
 * count up once on mount; with reduced motion they render final and static.
 *
 * Color encodes meaning, not decoration: `out` lines drain, the net stays.
 */

// Group thousands with '.' manually. Deterministic across locales and immune
// to es-ES dropping the separator on 4-digit numbers (9968), which would read
// inconsistently next to 5-digit figures (12.480) in the ledger column.
function groupEs(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const NET = HERO_LEDGER.lines.reduce(
  (acc, line) => (line.kind === 'in' ? acc + line.amount : acc - line.amount),
  0,
);

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return reduced;
}

/**
 * Returns `target` on the server and until animation runs (SSR-safe, works
 * without JS). Once mounted with motion allowed, counts 0 → target one time.
 */
function useCountUp(target: number, animate: boolean, duration = 700): number {
  const [value, setValue] = useState(target);
  const done = useRef(false);
  useEffect(() => {
    if (!animate || done.current) return;
    done.current = true;
    let raf = 0;
    let start = 0;
    setValue(0);
    const tick = (t: number) => {
      if (!start) start = t;
      const p = Math.min((t - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic — settles, no bounce
      setValue(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, animate, duration]);
  return value;
}

function Amount({ value, animate }: { value: number; animate: boolean }) {
  const shown = useCountUp(value, animate);
  return <>{groupEs(shown)}</>;
}

export function HeroLedger() {
  const reduced = usePrefersReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const animate = mounted && !reduced;

  return (
    <figure
      className="rounded-sm bg-[#17120B] p-6 tabular-nums shadow-[0_20px_50px_-24px_rgba(23,18,11,0.9)] ring-1 ring-white/5 md:p-8"
      aria-label={`Ejemplo: de ${groupEs(HERO_LEDGER.lines[0].amount)} en ventas te quedan ${groupEs(NET)} ${HERO_LEDGER.currency} limpios.`}
    >
      <figcaption className="mb-5 flex items-center justify-between text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-[#8B8073]">
        <span>Un pedido, en claro</span>
        <span>{HERO_LEDGER.currency}</span>
      </figcaption>

      <dl className="space-y-3.5">
        {HERO_LEDGER.lines.map((line, i) => {
          const out = line.kind === 'out';
          return (
            <div
              key={line.label}
              className="flex items-baseline justify-between gap-4"
              style={
                animate
                  ? { animation: `hero-line-rise 0.5s ${0.06 * i}s both ease-out` }
                  : undefined
              }
            >
              <dt className="text-[0.8125rem] uppercase tracking-[0.1em] text-[#A89F90]">
                {line.label}
              </dt>
              <dd
                className={`text-lg font-semibold ${out ? 'text-[#F0845A]' : 'text-[#EDE7DA]'}`}
              >
                <span aria-hidden className="mr-0.5 text-[#8B8073]">
                  {out ? '−' : '+'}
                </span>
                <Amount value={line.amount} animate={animate} />
              </dd>
            </div>
          );
        })}
      </dl>

      <div className="my-4 h-px bg-white/10" />

      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-[#CBB9F0]">
          {HERO_LEDGER.netLabel}
        </dt>
        <dd className="text-3xl font-extrabold tracking-tight text-[#B79CF5] md:text-[2.25rem]">
          <span aria-hidden className="mr-1 align-middle text-lg text-[#8B7BC7]">
            =
          </span>
          <Amount value={NET} animate={animate} />
          <span className="ml-1.5 align-baseline text-sm font-semibold text-[#8B7BC7]">
            {HERO_LEDGER.currency}
          </span>
        </dd>
      </div>
    </figure>
  );
}
