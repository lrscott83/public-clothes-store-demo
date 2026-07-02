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
    <section className="relative h-screen flex items-center">
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
      </div>

      <div className="container mx-auto px-4 z-10">
        <div className="max-w-3xl text-surface">
          <h1 className="text-5xl font-bold mb-6">{hero.heading}</h1>
          <p className="text-xl mb-8">{hero.subheading}</p>

          {hero.ctaLabel && hero.ctaPath && (
            <Link
              to={hero.ctaPath}
              className="inline-flex items-center gap-2 bg-primary px-6 py-3 rounded-md font-medium hover:bg-primary-hover transition-colors"
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
