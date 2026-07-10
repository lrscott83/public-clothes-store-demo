import { formatMoney } from '@store-mgmt/storefront/config';

export interface ClientStepDraft {
  name: string;
  phone: string;
  address: string;
  deliveryMode: 'domicilio' | 'recogida';
  method: string;
  needsChange: boolean;
  observations: string;
}

export interface ClientStepProps {
  draft: ClientStepDraft;
  onChange: (draft: ClientStepDraft) => void;
  cartItems: Array<{
    productId: string;
    name: string;
    image: string;
    price: number;
    quantity: number;
  }>;
  cartTotalUSD: number;
}

const MONEY = { locale: 'en-US', currency: 'USD' } as const;

export function ClientStep({ draft, onChange, cartItems, cartTotalUSD }: ClientStepProps) {
  function set<K extends keyof ClientStepDraft>(key: K, value: ClientStepDraft[K]) {
    onChange({ ...draft, [key]: value });
  }

  return (
    <section>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Left column — form fields */}
        <div>
          <h2 className="text-xl font-semibold text-text">Cliente</h2>

          <div className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm text-text">
              Nombre
              <input
                type="text"
                value={draft.name}
                onChange={(event) => set('name', event.target.value)}
                className="rounded border border-border px-3 py-2"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-text">
              Teléfono
              <input
                type="text"
                value={draft.phone}
                onChange={(event) => set('phone', event.target.value)}
                className="rounded border border-border px-3 py-2"
              />
            </label>

            <fieldset className="flex flex-col gap-1 text-sm text-text">
              <legend>Modalidad de entrega</legend>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="deliveryMode"
                  value="domicilio"
                  checked={draft.deliveryMode === 'domicilio'}
                  onChange={() => set('deliveryMode', 'domicilio')}
                />
                Domicilio
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="deliveryMode"
                  value="recogida"
                  checked={draft.deliveryMode === 'recogida'}
                  onChange={() => set('deliveryMode', 'recogida')}
                />
                Recogida
              </label>
            </fieldset>

            {draft.deliveryMode === 'domicilio' && (
              <label className="flex flex-col gap-1 text-sm text-text">
                Dirección
                <input
                  type="text"
                  required
                  value={draft.address}
                  onChange={(event) => set('address', event.target.value)}
                  className="rounded border border-border px-3 py-2"
                />
              </label>
            )}

            <label className="flex flex-col gap-1 text-sm text-text">
              Forma de pago
              <input
                type="text"
                value={draft.method}
                onChange={(event) => set('method', event.target.value)}
                className="rounded border border-border px-3 py-2"
              />
            </label>

            <label className="flex items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={draft.needsChange}
                onChange={(event) => set('needsChange', event.target.checked)}
              />
              ¿Lleva cambio?
            </label>

            <label className="flex flex-col gap-1 text-sm text-text">
              Observaciones
              <textarea
                value={draft.observations}
                onChange={(event) => set('observations', event.target.value)}
                className="rounded border border-border px-3 py-2"
              />
            </label>
          </div>
        </div>

        {/* Right column — readonly cart summary */}
        <div>
          <h2 className="text-xl font-semibold text-text">Resumen del pedido</h2>

          {cartItems.length === 0 ? (
            <p className="mt-4 text-sm text-text-muted">El carrito está vacío</p>
          ) : (
            <>
              <ul className="mt-4 max-h-[60vh] space-y-3 overflow-y-auto pr-2">
                {cartItems.map((item) => (
                  <li key={item.productId} className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
                    <img
                      src={item.image}
                      alt={item.name}
                      className="h-14 w-14 flex-shrink-0 rounded object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text">{item.name}</p>
                      <p className="text-xs text-text-muted">
                        {formatMoney(item.price, MONEY)} x {item.quantity}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-text">
                      {formatMoney(item.price * item.quantity, MONEY)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                <span className="text-base font-semibold text-text">Total</span>
                <span className="text-lg font-bold text-accent">
                  {formatMoney(cartTotalUSD, MONEY)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
