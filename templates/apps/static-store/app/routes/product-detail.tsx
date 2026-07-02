import { useParams } from 'react-router';
import type { StoreConfig } from '@store-mgmt/storefront/config';
import { formatMoney } from '@store-mgmt/storefront/config';
import type { CatalogProvider } from '@store-mgmt/storefront/catalog';
import { activeConfig, catalog } from '../store/active';
import type { Route } from './+types/product-detail';

export function meta(_args: Route.MetaArgs) {
  return [{ title: activeConfig.brand.name }];
}

export interface ProductDetailPageProps {
  config: StoreConfig;
  catalog: CatalogProvider;
}

/**
 * Client-side product detail. This route is intentionally NOT prerendered
 * (see `react-router.config.ts`) — the `:id` param is only known in the
 * browser, and resolution happens purely against the `CatalogProvider` seam.
 * An unknown id degrades gracefully to a not-found message rather than
 * throwing, so it stays usable when served through the GH Pages
 * `404.html` -> SPA-fallback deep-link path.
 */
export function ProductDetailPage({ config, catalog }: ProductDetailPageProps) {
  const { id } = useParams<{ id: string }>();
  const product = id ? catalog.getProductById(id) : undefined;

  if (!product) {
    return (
      <main className="pt-16 min-h-screen bg-background flex items-center justify-center">
        <p className="text-text-muted">Product not found.</p>
      </main>
    );
  }

  return (
    <main className="pt-16 min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 grid md:grid-cols-2 gap-8">
        <img
          src={product.image}
          alt={product.name}
          className="w-full rounded-lg object-cover shadow-card"
        />
        <div>
          <h1 className="text-3xl font-bold text-text">{product.name}</h1>
          <p className="mt-4 text-text-muted">{product.description}</p>
          <div className="mt-6 flex items-center gap-3">
            <span className="text-2xl font-bold text-accent">
              {formatMoney(product.price, { locale: config.locale, currency: config.currency })}
            </span>
            {product.originalPrice && (
              <span className="text-lg line-through text-text-muted">
                {formatMoney(product.originalPrice, {
                  locale: config.locale,
                  currency: config.currency,
                })}
              </span>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

export default function ProductDetailRoute() {
  return <ProductDetailPage config={activeConfig} catalog={catalog} />;
}
