import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import type { StoreConfig } from '../config/stores/types';

const DEFAULT_OVERLAY_COLOR = 'rgb(0 0 0)';
const DEFAULT_OVERLAY_OPACITY = 0.5;

export interface HeroProps {
  config: StoreConfig;
}

/**
 * Config-driven storefront hero. `hero.image` is optional in this app's
 * `StoreConfig` (types.ts) — when absent, a themed `bg-primary` gradient
 * stands in rather than a broken `<img>`.
 */
export function Hero({ config }: HeroProps) {
  const { hero } = config;
  const overlayColor = hero.overlayColor ?? DEFAULT_OVERLAY_COLOR;
  const overlayOpacity = hero.overlayOpacity ?? DEFAULT_OVERLAY_OPACITY;

  return (
    <section className="relative flex min-h-[480px] items-center overflow-hidden bg-gradient-to-br from-primary to-primary-hover">
      {hero.image && (
        <div className="absolute inset-0 z-0">
          <img data-testid="hero-image" src={hero.image} alt="" className="w-full h-full object-cover" />
          <div
            data-testid="hero-overlay"
            className="absolute inset-0"
            style={{ backgroundColor: overlayColor, opacity: overlayOpacity }}
          />
        </div>
      )}

      <div className="container mx-auto px-4 z-10">
        <div className="max-w-2xl text-surface">
          <h1 className="text-[clamp(2rem,7vw,4rem)] font-extrabold leading-[1.05] tracking-tight text-balance">
            {hero.heading}
          </h1>
          <p className="mt-5 max-w-xl text-base sm:text-lg lg:text-xl text-surface/85">{hero.subheading}</p>

          {hero.ctaLabel && hero.ctaPath && (
            <Link
              to={hero.ctaPath}
              className="mt-8 inline-flex items-center gap-2 rounded-md bg-surface px-7 py-3.5 font-semibold text-primary shadow-card transition-colors hover:bg-primary-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
            >
              {hero.ctaLabel}
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
