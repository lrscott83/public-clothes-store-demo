import type { CartLine } from '../../domain/availability';
import type { SeededProduct } from '../../domain/types';
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

  return (
    <section>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {catalog.map((product) => {
          const quantity = quantityFor(product.id);

          return (
            <ProductCard
              key={product.id}
              product={product}
              locale="en-US"
              currency="USD"
              cart={{
                quantity,
                onAddToCart: () => add(product.id),
                onIncrement: () => increment(product.id),
                onDecrement: () => decrement(product.id),
                onRemove: () => remove(product.id),
              }}
            />
          );
        })}
      </div>

      <button
        type="button"
        onClick={onNext}
        disabled={cart.length === 0}
        className="mt-6 rounded bg-primary px-4 py-2 text-white disabled:opacity-50"
      >
        Siguiente
      </button>
    </section>
  );
}
