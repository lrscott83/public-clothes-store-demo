import type { ReactNode } from 'react';
import { Package, Shield, Star, Truck, type LucideIcon } from 'lucide-react';
import type { StoreConfig } from '@store-mgmt/storefront/config';
import type { CatalogProvider } from '@store-mgmt/storefront/catalog';
import { Hero } from '../components/hero';
import { ProductGrid } from '../components/product-grid';
import { activeConfig, catalog } from '../store/active';
import { HOME_SECTIONS } from '../store/home-sections';
import type { Route } from './+types/home';

export function meta(_args: Route.MetaArgs) {
  return [
    { title: activeConfig.brand.name },
    { name: 'description', content: activeConfig.brand.tagline ?? activeConfig.hero.subheading },
  ];
}

const FEATURE_ICONS: Record<string, LucideIcon> = { Star, Shield, Truck, Package };
const DEFAULT_FEATURE_ICON = Package;

// English structural defaults. A vertical localizes these via
// `config.homeSections` (e.g. NOVA/clothes → Spanish) so the section headings
// match that vertical's nav labels; `demo` keeps the English defaults.
const DEFAULT_SECTION_COPY = {
  features: 'Features',
  offers: 'Special Offers',
  newArrivals: 'New Arrivals',
} as const;

export interface HomePageProps {
  config: StoreConfig;
  catalog: CatalogProvider;
}

/**
 * Config-driven landing page: Hero, an optional `config.features` section,
 * and two catalog-derived strips (discounted / new-arrivals). Every section
 * renders only when it has content, and its anchor id comes from the shared
 * `HOME_SECTIONS` map so the header nav filter stays in lockstep. Section
 * headings are config-localized (`config.homeSections`) with English defaults.
 */
export function HomePage({ config, catalog }: HomePageProps) {
  const discounted = catalog.getProducts().filter((product) => product.discount);
  const newest = catalog.getProducts().filter((product) => product.isNew);

  const sectionCopy = {
    features: config.homeSections?.features ?? DEFAULT_SECTION_COPY.features,
    offers: config.homeSections?.offers ?? DEFAULT_SECTION_COPY.offers,
    newArrivals: config.homeSections?.newArrivals ?? DEFAULT_SECTION_COPY.newArrivals,
  };

  return (
    <main>
      <Hero config={config} />

      {config.features && config.features.length > 0 && (
        <section
          id={HOME_SECTIONS.features}
          className="py-16 sm:py-20 lg:py-24 bg-background scroll-mt-16"
        >
          <div className="container mx-auto px-4">
            <SectionHeading>{sectionCopy.features}</SectionHeading>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {config.features.map((feature) => {
                const FeatureIcon = FEATURE_ICONS[feature.icon] ?? DEFAULT_FEATURE_ICON;
                return (
                  <div
                    key={feature.title}
                    className="p-6 bg-surface rounded-lg shadow-card transition-shadow duration-300 hover:shadow-md"
                  >
                    <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-md bg-primary-light">
                      <FeatureIcon className="w-6 h-6 text-primary" aria-hidden="true" />
                    </span>
                    <h3 className="text-lg font-semibold mb-1.5 text-text">{feature.title}</h3>
                    <p className="text-sm text-text-muted">{feature.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {discounted.length > 0 && (
        <section id={HOME_SECTIONS.offers} className="py-16 sm:py-20 lg:py-24 scroll-mt-16">
          <div className="container mx-auto px-4">
            <SectionHeading>{sectionCopy.offers}</SectionHeading>
            <ProductGrid products={discounted} locale={config.locale} currency={config.currency} />
          </div>
        </section>
      )}

      {newest.length > 0 && (
        <section
          id={HOME_SECTIONS.newArrivals}
          className="py-16 sm:py-20 lg:py-24 bg-background scroll-mt-16"
        >
          <div className="container mx-auto px-4">
            <SectionHeading>{sectionCopy.newArrivals}</SectionHeading>
            <ProductGrid products={newest} locale={config.locale} currency={config.currency} />
          </div>
        </section>
      )}
    </main>
  );
}

/**
 * Centered section heading with the brand's steel-blue accent rule beneath it
 * — the connective signature that ties every catalog section to the vertical's
 * primary color.
 */
function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <div className="mb-10 sm:mb-12 text-center">
      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-text">{children}</h2>
      <span aria-hidden className="mt-3 inline-block h-1 w-12 rounded-pill bg-primary" />
    </div>
  );
}

export default function Home() {
  return <HomePage config={activeConfig} catalog={catalog} />;
}
