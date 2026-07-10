import { ShoppingCart, Plus, Minus, Trash2 } from 'lucide-react';
import { formatMoney } from '@store-mgmt/storefront/config';
import type { StoreProduct } from '@store-mgmt/storefront/catalog';

export interface ProductCardCartProps {
  quantity: number;
  onAddToCart: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
  onRemove: () => void;
}

export interface ProductCardProps {
  product: StoreProduct;
  locale: string;
  currency: string;
  cart?: ProductCardCartProps;
  showDescription?: boolean;
}

/**
 * Copy-adapted from templates/apps/static-store/app/components/product-card.tsx
 * (no shared `ProductCard` export exists — see design.md). Price is formatted
 * via `formatMoney` (`Intl.NumberFormat`), never `"$" + toFixed(2)`.
 *
 * Enhanced with badges (New / discount), original price strikethrough, and
 * optional cart controls (ShoppingCart icon / quantity stepper). When `cart`
 * prop is absent, the render is identical to the original (non-cart usage).
 */
export function ProductCard({ product, locale, currency, cart, showDescription = true }: ProductCardProps) {
  const hasBadge = product.isNew || product.discount;

  return (
    <div className="group relative rounded-lg shadow-card overflow-hidden bg-surface transition-transform duration-300 hover:scale-[1.02]">
      {hasBadge && (
        <div className="absolute top-2 left-2 z-10 flex gap-2">
          {product.isNew && (
            <span className="bg-success text-surface px-2 py-1 text-xs rounded-pill">
              New
            </span>
          )}
          {product.discount && (
            <span className="bg-danger text-surface px-2 py-1 text-xs rounded-pill">
              -{product.discount}%
            </span>
          )}
        </div>
      )}

      <div className="w-full overflow-hidden">
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-64 object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>

      <div className="relative p-4">
        <h3 className="text-lg font-semibold text-text">{product.name}</h3>
        {showDescription && (
          <p className="mt-1 text-sm text-text-muted">{product.description}</p>
        )}

        <div className="mt-2 flex items-center gap-2">
          <span className="text-lg font-bold text-accent">
            {formatMoney(product.price, { locale, currency })}
          </span>
          {product.originalPrice && (
            <span className="text-sm line-through text-text-muted">
              {formatMoney(product.originalPrice, { locale, currency })}
            </span>
          )}
        </div>

        {cart && (
          <div className="absolute bottom-4 right-4">
            {cart.quantity === 0 ? (
              <button
                type="button"
                onClick={cart.onAddToCart}
                aria-label={`Agregar ${product.name} al carrito`}
                className="rounded-full bg-primary p-2 text-white shadow-md hover:bg-primary/90 transition-colors"
              >
                <ShoppingCart size={16} />
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={cart.onDecrement}
                  disabled={cart.quantity <= 1}
                  aria-label={`Disminuir cantidad de ${product.name}`}
                  className="rounded border border-border p-1 disabled:opacity-50 hover:bg-surface-hover transition-colors"
                >
                  <Minus size={14} />
                </button>
                <span className="w-6 text-center text-sm font-medium text-text">
                  {cart.quantity}
                </span>
                <button
                  type="button"
                  onClick={cart.onIncrement}
                  aria-label={`Aumentar cantidad de ${product.name}`}
                  className="rounded border border-border p-1 hover:bg-surface-hover transition-colors"
                >
                  <Plus size={14} />
                </button>
                <button
                  type="button"
                  onClick={cart.onRemove}
                  aria-label={`Quitar ${product.name} del carrito`}
                  className="ml-1 rounded p-1 text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
