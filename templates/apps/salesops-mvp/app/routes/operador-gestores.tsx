import { useCallback, useMemo, useState } from 'react';
import type { Route } from './+types/operador-gestores';
import { KanbanBoard } from '../components/tablero/kanban-board';
import { GestorOrderCard } from '../components/tablero/operador-gestores/gestor-order-card';
import { OrderDetailPopup } from '../components/tablero/operador-gestores/order-detail-popup';
import type { Order } from '../domain/types';
import { GESTORES } from '../seed/constants';
import { loadSeedState, markCommissionPaid, verifyOrder } from '../store/seed-store';

export function meta(_args: Route.MetaArgs) {
  return [{ title: 'Operador de gestores — Sales Ops Cockpit' }];
}

/**
 * Gestor kanban board. One column per order state, each card shows the
 * assigned gestor's info, client details, totals, and an action dropdown
 * (Detalles, Aceptar, Pagar Comisión) gated by order state.
 */
export default function OperadorGestores() {
  const [orders, setOrders] = useState<Order[]>(() => loadSeedState().orders);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const gestorMap = useMemo(
    () => Object.fromEntries(GESTORES.map((g) => [g.id, g])),
    [],
  );

  function reloadOrders() {
    setOrders(loadSeedState().orders);
  }

  const handleDetalles = useCallback((order: Order) => {
    setSelectedOrder(order);
  }, []);

  const handleVerifyOrder = useCallback((id: string) => {
    verifyOrder(id);
    reloadOrders();
  }, []);

  const handleMarkCommissionPaid = useCallback((id: string) => {
    markCommissionPaid(id);
    reloadOrders();
  }, []);

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold text-text">Operador de gestores</h1>
      <KanbanBoard
        orders={orders}
        renderCard={(order) => (
          <GestorOrderCard
            order={order}
            gestor={gestorMap[order.gestorId]}
            onDetalles={handleDetalles}
            onVerifyOrder={handleVerifyOrder}
            onMarkCommissionPaid={handleMarkCommissionPaid}
          />
        )}
      />
      {selectedOrder && (
        <OrderDetailPopup
          order={selectedOrder}
          gestor={gestorMap[selectedOrder.gestorId]}
          onClose={() => setSelectedOrder(null)}
        />
      )}
    </main>
  );
}
