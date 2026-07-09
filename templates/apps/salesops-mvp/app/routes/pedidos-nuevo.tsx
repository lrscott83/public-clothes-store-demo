import { useState } from 'react';
import type { Route } from './+types/pedidos-nuevo';
import { CartStep } from '../components/pedido/cart-step';
import { ClientStep, type ClientStepDraft } from '../components/pedido/client-step';
import { WarehouseStep } from '../components/pedido/warehouse-step';
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

  const { products, inventory, warehouses } = loadSeedState();
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
    </main>
  );
}
