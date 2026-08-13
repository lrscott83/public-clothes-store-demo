import { formatMoney } from '../../shared/lib/money';
import { fetchPublicProduct } from '../../shared/lib/public-api.server';
import { resolveStoreConfig } from '../../shared/lib/store-config.server';
import { ProductImage } from '../../shared/components/image-placeholder';
import { ProductBadges } from '../components/product-badges';
import type { StoreConfig } from '../../shared/config/stores/types';
import type { PublicProductDto } from '../../shared/lib/public-api.types';
import type { Route } from './+types/product-detail';

export function meta() {
  return [{ title: 'Producto' }];
}

/**
 * Calls `GET /public/products/:id`. `fetchPublicProduct` returns `null` for
 * a 404 (unknown/inactive product) rather than throwing — this route never
 * hard-404s on a stale/guessed id, it degrades gracefully (design.md D9,
 * mirrors `static-store/product-detail.tsx`'s client-side design, read-only
 * reference, never imported).
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const config = resolveStoreConfig(request);
  const host = request.headers.get('host') ?? '';
  const product = params.id ? await fetchPublicProduct(params.id, host) : null;

  return { config, product };
}

export interface ProductDetailPageProps {
  config: StoreConfig;
  product: PublicProductDto | null;
}

export function ProductDetailPage({ config, product }: ProductDetailPageProps) {
  if (!product) {
    return (
      <main className="pt-16 min-h-screen bg-background flex items-center justify-center">
        <p className="text-text-muted">Producto no encontrado.</p>
      </main>
    );
  }

  return (
    <main className="pt-16 min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 grid md:grid-cols-2 gap-8">
        <div className="relative">
          <ProductBadges item={product} locale={config.locale} />
          <ProductImage
            src={product.imageUrl}
            alt={product.name}
            className="w-full rounded-lg object-cover shadow-card"
          />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-text">{product.name}</h1>
          <p className="mt-4 text-text-muted">{product.description}</p>
          <div className="mt-6 flex items-center gap-3">
            <span className="text-2xl font-bold text-accent">
              {formatMoney(product.finalPrice.amount, {
                locale: config.locale,
                currency: product.finalPrice.currency,
              })}
            </span>
            {product.isOffer && (
              <span data-testid="product-detail-original-price" className="text-lg line-through text-text-muted">
                {formatMoney(product.price.amount, { locale: config.locale, currency: product.price.currency })}
              </span>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

export default function ProductDetailRoute({ loaderData }: Route.ComponentProps) {
  return <ProductDetailPage config={loaderData.config} product={loaderData.product} />;
}
