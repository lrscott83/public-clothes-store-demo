import { useState, useEffect } from 'react';
import type { Route } from './+types/pedidos-nuevo';
import { ShoppingCart, X, Trash2 } from 'lucide-react';
import { formatMoney } from '@store-mgmt/storefront/config';
import { CartStep } from '../components/pedido/cart-step';
import { ClientStep, type ClientStepDraft } from '../components/pedido/client-step';
import { WarehouseStep } from '../components/pedido/warehouse-step';
import { cartTotalUSD } from '../domain/cart';
import { eligibleWarehouses, type CartLine } from '../domain/availability';
import { GESTORES } from '../seed/constants';
import { createOrder, loadSeedState } from '../store/seed-store';
import type { Client, Order, OrderItem, PaymentInfo } from '../domain/types';

export function meta(_args: Route.MetaArgs) {
  return [{ title: 'Nuevo pedido — Sales Ops Cockpit' }];
}

type Step = 'carrito' | 'cliente' | 'almacen';

// MVP has no auth: the wizard header shows the fixed demo gestor persona.
const GESTOR = GESTORES[0];

function buildEmptyClientDraft(): ClientStepDraft {
  return {
    name: '',
    phone: '',
    address: '',
    deliveryMode: 'domicilio',
    method: 'efectivo',
    needsChange: false,
    observations: '',
  };
}

/**
 * Three-step wizard container (carrito → cliente → almacen) driven by local
 * `useState` — no nested routes, no RR7 `<Form>`/action/loader navigation
 * (sidesteps the jsdom+undici `AbortSignal` gotcha). Confirm is a plain
 * `onClick` that calls `createOrder` and renders an in-place success view
 * (no `useNavigate`).
 */
export default function PedidosNuevo() {
  const [step, setStep] = useState<Step>('carrito');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [clientDraft, setClientDraft] = useState<ClientStepDraft>(buildEmptyClientDraft);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [created, setCreated] = useState<Order | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);

  const { products, inventory, warehouses } = loadSeedState();

  const MONEY = { locale: 'en-US', currency: 'USD' } as const;
  const eligible = eligibleWarehouses(cart, inventory, warehouses);

  function handleCarritoNext() {
    if (cart.length === 0) return;
    setStep('cliente');
  }

  function handleClienteNext() {
    const canAdvance =
      clientDraft.name.trim() !== '' &&
      clientDraft.phone.trim() !== '' &&
      (clientDraft.deliveryMode !== 'domicilio' || clientDraft.address.trim() !== '');
    if (!canAdvance) return;
    setWarehouseId(null);
    setStep('almacen');
  }

  function handleConfirm() {
    if (!warehouseId || eligible.length === 0) return;

    const items: OrderItem[] = cart.map((line) => {
      const product = products.find((item) => item.id === line.productId);
      return {
        productId: line.productId,
        quantity: line.quantity,
        priceUSD: product?.price ?? 0,
        commissionMN: product?.commissionMN ?? 0,
      };
    });

    const now = new Date();

    const client: Client = {
      id: `client-user-${now.getTime()}`,
      name: clientDraft.name,
      phone: clientDraft.phone,
      address: clientDraft.address,
      deliveryMode: clientDraft.deliveryMode,
    };

    const payment: PaymentInfo = {
      method: clientDraft.method,
      needsChange: clientDraft.needsChange,
    };

    const order = createOrder(
      {
        items,
        client,
        payment,
        warehouseId,
        gestorId: GESTOR.id,
        observations: clientDraft.observations,
      },
      now,
    );

    setCreated(order);
  }

  function cartLines() {
    return cart.map((line) => {
      const product = products.find((item) => item.id === line.productId);
      return { product, quantity: line.quantity, priceUSD: product?.price ?? 0 };
    });
  }

  const total = cartTotalUSD(cartLines());

  function removeFromCart(productId: string) {
    setCart(cart.filter((line) => line.productId !== productId));
  }

  useEffect(() => {
    if (!popupOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPopupOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [popupOpen]);

  if (created) {
    return (
      <main className="p-8">
        <h1 className="text-2xl font-bold text-text">Pedido creado</h1>
        <p className="mt-2 text-sm text-text-muted">
          Pedido {created.id} creado con éxito. Total: ${created.totalUSD}.
        </p>
      </main>
    );
  }

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold text-text">Nuevo pedido</h1>
      <p className="mt-1 text-sm text-text-muted">Gestor: {GESTOR.name}</p>

      {/* Cart Floating Bar — visible across all steps */}
      <div className="sticky top-0 z-40 -mx-8 mb-6 border-b border-border bg-surface px-8 py-3">
        <div className="flex items-center justify-end gap-4">
          <span className="text-lg font-bold text-text">
            Total: {formatMoney(total, MONEY)}
          </span>
          <button
            type="button"
            onClick={() => setPopupOpen(true)}
            className="relative rounded-full p-2 hover:bg-primary-light transition-colors"
            aria-label="Abrir carrito"
          >
            <ShoppingCart size={20} className="text-primary" />
            {cart.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-white">
                {cart.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {step === 'carrito' && (
        <CartStep catalog={products} cart={cart} onChange={setCart} onNext={handleCarritoNext} />
      )}

      {step === 'cliente' && (
        <ClientStep
          draft={clientDraft}
          onChange={setClientDraft}
          onNext={handleClienteNext}
          onBack={() => setStep('carrito')}
        />
      )}

      {step === 'almacen' && (
        <WarehouseStep
          eligible={eligible}
          warehouseId={warehouseId}
          onSelect={setWarehouseId}
          onConfirm={handleConfirm}
          onBack={() => setStep('cliente')}
        />
      )}

      {/* Cart Popup */}
      {popupOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setPopupOpen(false)}
        >
          <div
            className="mx-4 flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg bg-surface shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border p-4">
              <h2 className="text-lg font-semibold text-text">Carrito</h2>
              <button
                type="button"
                onClick={() => setPopupOpen(false)}
                className="rounded-full p-1 hover:bg-border transition-colors"
                aria-label="Cerrar carrito"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4">
              {cart.length === 0 ? (
                <p className="text-sm text-text-muted text-center py-8">
                  El carrito está vacío
                </p>
              ) : (
                <ul className="space-y-3">
                  {cart.map((line) => {
                    const product = products.find((p) => p.id === line.productId);
                    if (!product) return null;
                    const lineTotal = product.price * line.quantity;

                    return (
                      <li key={line.productId} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                        <img
                          src={product.image}
                          alt={product.name}
                          className="h-12 w-12 flex-shrink-0 rounded object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-text truncate">{product.name}</p>
                          <p className="text-xs text-text-muted">
                            {formatMoney(product.price, MONEY)} x {line.quantity} = {formatMoney(lineTotal, MONEY)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFromCart(line.productId)}
                          className="flex-shrink-0 rounded p-1 text-red-600 hover:bg-red-50 transition-colors"
                          aria-label={`Quitar ${product.name} del carrito`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-border p-4">
              <span className="text-base font-semibold text-text">Total</span>
              <span className="text-lg font-bold text-accent">
                {formatMoney(total, MONEY)}
              </span>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
