import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import type { StoreConfig } from '@store-mgmt/storefront/config';

const DEFAULT_OVERLAY_COLOR = 'rgb(0 0 0)';
const DEFAULT_OVERLAY_OPACITY = 0.5;

export interface HeroProps {
  config: StoreConfig;
}

/**
 * Config-driven storefront hero. The rendered image, heading, subheading,
 * optional CTA and overlay all come from `config.hero` — never a hardcoded
 * literal (fixes the legacy dead `hero.backgroundImage` field / hardcoded
 * `hero5.jpg` bug).
 */
export function Hero({ config }: HeroProps) {
  const { hero } = config;
  const overlayColor = hero.overlayColor ?? DEFAULT_OVERLAY_COLOR;
  const overlayOpacity = hero.overlayOpacity ?? DEFAULT_OVERLAY_OPACITY;

  return (
    <section className="relative flex min-h-[560px] h-[100svh] items-center overflow-hidden">
      <div className="absolute inset-0 z-0">
        <img
          data-testid="hero-image"
          src={hero.image}
          alt=""
          className="w-full h-full object-cover"
        />
        <div
          data-testid="hero-overlay"
          className="absolute inset-0"
          style={{ backgroundColor: overlayColor, opacity: overlayOpacity }}
        />
        {/* Legibility scrim layered ON TOP of the config overlay (which stays
            authoritative): darker where the copy sits — left on desktop, bottom
            on mobile — fading toward the image so the photo still reads. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent sm:bg-gradient-to-r sm:from-black/60 sm:via-black/20 sm:to-transparent"
        />
      </div>

      <div className="container mx-auto px-4 z-10">
        <div className="hero-rise max-w-2xl text-surface">
          <h1 className="text-[clamp(2rem,7vw,4rem)] font-extrabold leading-[1.05] tracking-tight text-balance">
            {hero.heading}
          </h1>
          <p className="mt-5 max-w-xl text-base sm:text-lg lg:text-xl text-surface/85">
            {hero.subheading}
          </p>

          {hero.ctaLabel && hero.ctaPath && (
            <Link
              to={hero.ctaPath}
              className="mt-8 inline-flex items-center gap-2 rounded-md bg-primary px-7 py-3.5 font-semibold text-surface shadow-card transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
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
