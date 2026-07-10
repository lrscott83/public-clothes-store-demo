import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { CartLine } from '../../domain/availability';
import type { SeededProduct } from '../../domain/types';
import { catalogProvider } from '../../data/catalog';
import { ProductCard } from '../product-card';

export interface CartStepProps {
  catalog: SeededProduct[];
  cart: CartLine[];
  onChange: (cart: CartLine[]) => void;
  onNext: () => void;
}

/**
 * Carrito step: product grid with add/remove/qty-change controls and a live
 * USD total. Purely presentational — all cart state lives in the container
 * (`routes/pedidos-nuevo.tsx`); every interaction calls `onChange` with the
 * next full `CartLine[]`.
 *
 * Each product is rendered via the enhanced `ProductCard` component (badges,
 * original price, cart controls) instead of inline `<li>` markup.
 */
export function CartStep({ catalog, cart, onChange, onNext }: CartStepProps) {
  function quantityFor(productId: string): number {
    return cart.find((line) => line.productId === productId)?.quantity ?? 0;
  }

  function add(productId: string) {
    onChange([...cart, { productId, quantity: 1 }]);
  }

  function increment(productId: string) {
    onChange(
      cart.map((line) =>
        line.productId === productId ? { ...line, quantity: line.quantity + 1 } : line,
      ),
    );
  }

  function decrement(productId: string) {
    onChange(
      cart
        .map((line) =>
          line.productId === productId ? { ...line, quantity: line.quantity - 1 } : line,
        )
        .filter((line) => line.quantity > 0),
    );
  }

  function remove(productId: string) {
    onChange(cart.filter((line) => line.productId !== productId));
  }

  const [categoryFilter, setCategoryFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const categories = catalogProvider.getCategories();

  const filteredCatalog = useMemo(() => {
    let result = catalog;
    if (categoryFilter) {
      result = result.filter((p) => p.categoryId === categoryFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(q));
    }
    return result;
  }, [catalog, categoryFilter, searchQuery]);

  return (
    <section>
      {/* Filter bar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        {/* Search input */}
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar producto..."
            className="w-full rounded border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        {/* Category select */}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">Todas las categorías</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {filteredCatalog.length === 0 ? (
          <p className="col-span-full py-8 text-center text-sm text-text-muted">
            No se encontraron productos con los filtros actuales.
          </p>
        ) : (
          filteredCatalog.map((product) => {
          const quantity = quantityFor(product.id);

          return (
            <ProductCard
              key={product.id}
              product={product}
              locale="en-US"
              currency="USD"
              showDescription={false}
              cart={{
                quantity,
                onAddToCart: () => add(product.id),
                onIncrement: () => increment(product.id),
                onDecrement: () => decrement(product.id),
                onRemove: () => remove(product.id),
              }}
            />
          );
        })
      )}
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onNext}
          disabled={cart.length === 0}
          className="rounded bg-primary px-4 py-2 text-white disabled:opacity-50"
        >
          Siguiente
        </button>
      </div>
    </section>
  );
}
