import { useState } from 'react';
import type { Route } from './+types/operador-gestores';
import { KanbanBoard } from '../components/tablero/kanban-board';
import { OrderReview } from '../components/tablero/order-review';
import { eligibleWarehouses } from '../domain/availability';
import type { Order } from '../domain/types';
import { GESTORES } from '../seed/constants';
import { loadSeedState, markCommissionPaid, verifyOrder } from '../store/seed-store';

export function meta(_args: Route.MetaArgs) {
  return [{ title: 'Operador de gestores — Sales Ops Cockpit' }];
}

type View = 'board' | 'review';

/**
 * Board ↔ review-detail container driven by local `useState` — mirrors the
 * `pedidos-nuevo` wizard's step-swap pattern. No nested routes, no RR7
 * `<Form>`/action/loader, no `useNavigate` (sidesteps the jsdom+undici
 * `AbortSignal` gotcha). Actions call the store then re-read orders from it,
 * which is the single source of truth after a write.
 */
export default function OperadorGestores() {
  const [orders, setOrders] = useState<Order[]>(() => loadSeedState().orders);
  const [view, setView] = useState<View>('board');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  function reloadOrders() {
    setOrders(loadSeedState().orders);
  }

  function handleRevisar(id: string) {
    setSelectedOrderId(id);
    setView('review');
  }

  function handleAceptar(id: string) {
    verifyOrder(id);
    reloadOrders();
    setView('board');
  }

  function handleMarkPaid(id: string) {
    markCommissionPaid(id);
    reloadOrders();
  }

  function handleBack() {
    setView('board');
  }

  const selectedOrder = selectedOrderId ? orders.find((order) => order.id === selectedOrderId) : undefined;
  const gestor = selectedOrder ? GESTORES.find((g) => g.id === selectedOrder.gestorId) : undefined;
  const { inventory, warehouses } = loadSeedState();
  const availableAtWarehouse = selectedOrder
    ? eligibleWarehouses(selectedOrder.items, inventory, warehouses).some(
        (warehouse) => warehouse.id === selectedOrder.warehouseId,
      )
    : false;

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold text-text">Operador de gestores</h1>

      {view === 'board' && <KanbanBoard orders={orders} onRevisar={handleRevisar} onMarkPaid={handleMarkPaid} />}

      {view === 'review' && selectedOrder && (
        <OrderReview
          order={selectedOrder}
          gestor={gestor}
          availableAtWarehouse={availableAtWarehouse}
          onAceptar={() => handleAceptar(selectedOrder.id)}
          onBack={handleBack}
        />
      )}
    </main>
  );
}
