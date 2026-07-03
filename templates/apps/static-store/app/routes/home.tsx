import { Package, Shield, Star, Truck, type LucideIcon } from 'lucide-react';
import type { StoreConfig } from '@store-mgmt/storefront/config';
import type { CatalogProvider } from '@store-mgmt/storefront/catalog';
import { Hero } from '../components/hero';
import { ProductGrid } from '../components/product-grid';
import { activeConfig, catalog } from '../store/active';
import type { Route } from './+types/home';

export function meta(_args: Route.MetaArgs) {
  return [
    { title: activeConfig.brand.name },
    { name: 'description', content: activeConfig.brand.tagline ?? activeConfig.hero.subheading },
  ];
}

const FEATURE_ICONS: Record<string, LucideIcon> = { Star, Shield, Truck, Package };
const DEFAULT_FEATURE_ICON = Package;

export interface HomePageProps {
  config: StoreConfig;
  catalog: CatalogProvider;
}

/**
 * Config-driven landing page: Hero, an optional `config.features` section,
 * and two catalog-derived strips (discounted / new-arrivals). All copy that
 * IS part of `StoreConfig` (hero text, feature title/description) is fully
 * config-driven; the strip section headings are structural chrome (no
 * `StoreConfig` field models them) and stay in English per the established
 * template convention (see Slice 3 apply-progress Deviation 5).
 */
export function HomePage({ config, catalog }: HomePageProps) {
  const discounted = catalog.getProducts().filter((product) => product.discount);
  const newest = catalog.getProducts().filter((product) => product.isNew);

  return (
    <main>
      <Hero config={config} />

      {config.features && config.features.length > 0 && (
        <section id="caracteristicas" className="py-20 bg-background scroll-mt-20">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl font-bold mb-12 text-center text-text">Features</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              {config.features.map((feature) => {
                const FeatureIcon = FEATURE_ICONS[feature.icon] ?? DEFAULT_FEATURE_ICON;
                return (
                  <div key={feature.title} className="p-6 bg-surface rounded-lg shadow-card">
                    <FeatureIcon className="w-10 h-10 text-accent mb-4" aria-hidden="true" />
                    <h3 className="text-xl font-semibold mb-2 text-text">{feature.title}</h3>
                    <p className="text-text-muted">{feature.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {discounted.length > 0 && (
        <section id="ofertas" className="py-20 scroll-mt-20">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl font-bold mb-12 text-center text-text">Special Offers</h2>
            <ProductGrid products={discounted} locale={config.locale} currency={config.currency} />
          </div>
        </section>
      )}

      {newest.length > 0 && (
        <section id="novedades" className="py-20 bg-background scroll-mt-20">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl font-bold mb-12 text-center text-text">New Arrivals</h2>
            <ProductGrid products={newest} locale={config.locale} currency={config.currency} />
          </div>
        </section>
      )}
    </main>
  );
}

export default function Home() {
  return <HomePage config={activeConfig} catalog={catalog} />;
}
