import type { CartLine } from '../../domain/availability';
import { cartTotalUSD } from '../../domain/cart';
import type { SeededProduct } from '../../domain/types';

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
 */
export function CartStep({ catalog, cart, onChange, onNext }: CartStepProps) {
  const lines = cart.map((line) => {
    const product = catalog.find((item) => item.id === line.productId);
    return { priceUSD: product?.price ?? 0, quantity: line.quantity };
  });
  const total = cartTotalUSD(lines);

  function quantityFor(productId: string): number {
    return cart.find((line) => line.productId === productId)?.quantity ?? 0;
  }

  function add(productId: string) {
    onChange([...cart, { productId, quantity: 1 }]);
  }

  function increment(productId: string) {
    onChange(
      cart.map((line) => (line.productId === productId ? { ...line, quantity: line.quantity + 1 } : line)),
    );
  }

  function decrement(productId: string) {
    onChange(
      cart
        .map((line) => (line.productId === productId ? { ...line, quantity: line.quantity - 1 } : line))
        .filter((line) => line.quantity > 0),
    );
  }

  function remove(productId: string) {
    onChange(cart.filter((line) => line.productId !== productId));
  }

  return (
    <section className="p-8">
      <h2 className="text-xl font-semibold text-text">Carrito</h2>
      <p className="mt-2 text-sm text-text-muted">Total: ${total}</p>

      <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {catalog.map((product) => {
          const quantity = quantityFor(product.id);

          return (
            <li key={product.id} className="rounded-lg border border-border p-4">
              <p className="font-medium text-text">{product.name}</p>
              <p className="text-sm text-text-muted">${product.price}</p>

              {quantity === 0 ? (
                <button
                  type="button"
                  onClick={() => add(product.id)}
                  className="mt-2 rounded bg-primary px-3 py-1 text-sm text-white"
                >
                  {`Agregar ${product.name}`}
                </button>
              ) : (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Disminuir cantidad de ${product.name}`}
                    onClick={() => decrement(product.id)}
                    disabled={quantity <= 1}
                    className="rounded border border-border px-2 disabled:opacity-50"
                  >
                    -
                  </button>
                  <span>{quantity}</span>
                  <button
                    type="button"
                    aria-label={`Aumentar cantidad de ${product.name}`}
                    onClick={() => increment(product.id)}
                    className="rounded border border-border px-2"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(product.id)}
                    className="ml-2 text-sm text-red-600"
                  >
                    {`Quitar ${product.name}`}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

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
