import { useCallback, useMemo, useState } from 'react';
import type { Route } from './+types/operador-gestores';
import { GestorOrderList } from '../components/tablero/operador-gestores/gestor-order-list';
import { OrderDetailPopup } from '../components/tablero/operador-gestores/order-detail-popup';
import type { Order } from '../domain/types';
import { GESTORES } from '../seed/constants';
import { loadSeedState, markCommissionPaid, verifyOrder } from '../store/seed-store';

export function meta(_args: Route.MetaArgs) {
  return [{ title: 'Operador de gestores — Sales Ops Cockpit' }];
}

/**
 * Flat-list container for gestor orders. Renders all orders in a single
 * scrollable column regardless of state. Actions (Detalles, Aceptar, Pagar
 * Comisión) live in a gated dropdown per card. No kanban board, no review
 * view — the popup is a read-only detail overlay.
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
      <GestorOrderList
        orders={orders}
        gestorMap={gestorMap}
        onDetalles={handleDetalles}
        onVerifyOrder={handleVerifyOrder}
        onMarkCommissionPaid={handleMarkCommissionPaid}
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
