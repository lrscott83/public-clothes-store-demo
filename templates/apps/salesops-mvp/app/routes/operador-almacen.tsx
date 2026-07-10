import { useMemo, useState } from 'react';
import type { Route } from './+types/operador-almacen';
import { KanbanBoard } from '../components/tablero/kanban-board';
import { AlmacenOrderCard } from '../components/tablero/operador-almacen/almacen-order-card';
import { OrderDetailPopup } from '../components/tablero/operador-gestores/order-detail-popup';
import { TransportistaPicker } from '../components/tablero/transportista-picker';
import { WarehouseSelector } from '../components/tablero/warehouse-selector';
import type { Order, OrderState } from '../domain/types';
import { GESTORES } from '../seed/constants';
import { assignTransportista, loadSeedState, markDelivered } from '../store/seed-store';

export function meta(_args: Route.MetaArgs) {
  return [{ title: 'Operador de almacén — Sales Ops Cockpit' }];
}

type View = 'board' | 'asignar';

const VISIBLE_STATES: OrderState[] = ['verificado', 'transportando', 'entregado'];

/**
 * Board ↔ picker container driven by local `useState` — mirrors
 * `operador-gestores.tsx`'s pattern: each order renders as an `AlmacenOrderCard`
 * (gestor identity, totals, a `⋮` action menu, and a "Detalles" popup). A
 * warehouse selector filters the shared kanban board (narrowed to
 * `verificado`/`transportando`/`entregado` via `visibleStates`) to the
 * currently selected warehouse; switching the selector re-filters without
 * unmounting the container.
 */
export default function OperadorAlmacen() {
  const { warehouses, transportistas } = loadSeedState();
  const [orders, setOrders] = useState<Order[]>(() => loadSeedState().orders);
  const [view, setView] = useState<View>('board');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(warehouses[0].id);
  const [selectedTransportistaId, setSelectedTransportistaId] = useState<string | null>(null);
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);

  const gestorMap = useMemo(() => Object.fromEntries(GESTORES.map((g) => [g.id, g])), []);

  function reloadOrders() {
    setOrders(loadSeedState().orders);
  }

  function handleDetalles(order: Order) {
    setDetailOrder(order);
  }

  function handleAsignarTransportista(id: string) {
    setSelectedOrderId(id);
    setSelectedTransportistaId(null);
    setView('asignar');
  }

  function handleSelectTransportista(transportistaId: string) {
    setSelectedTransportistaId(transportistaId);
  }

  function handleConfirmAsignar() {
    if (!selectedOrderId || !selectedTransportistaId) return;
    assignTransportista(selectedOrderId, selectedTransportistaId);
    reloadOrders();
    setView('board');
  }

  function handleMarcarEntregado(id: string) {
    markDelivered(id);
    reloadOrders();
  }

  function handleSelectWarehouse(warehouseId: string) {
    setSelectedWarehouseId(warehouseId);
  }

  function handleBack() {
    setView('board');
  }

  const selectedOrder = selectedOrderId ? orders.find((order) => order.id === selectedOrderId) : undefined;
  const visibleOrders = orders.filter((order) => order.warehouseId === selectedWarehouseId);

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold text-text">Operador de almacén</h1>

      {view === 'board' && (
        <>
          <WarehouseSelector
            warehouses={warehouses}
            selectedWarehouseId={selectedWarehouseId}
            onSelect={handleSelectWarehouse}
          />
          <KanbanBoard
            orders={visibleOrders}
            visibleStates={VISIBLE_STATES}
            renderCard={(order) => (
              <AlmacenOrderCard
                order={order}
                gestor={gestorMap[order.gestorId]}
                onDetalles={handleDetalles}
                onAsignarTransportista={handleAsignarTransportista}
                onMarcarEntregado={handleMarcarEntregado}
              />
            )}
          />
        </>
      )}

      {view === 'asignar' && selectedOrder && (
        <TransportistaPicker
          order={selectedOrder}
          transportistas={transportistas}
          selectedTransportistaId={selectedTransportistaId}
          onSelect={handleSelectTransportista}
          onConfirm={handleConfirmAsignar}
          onBack={handleBack}
        />
      )}

      {detailOrder && (
        <OrderDetailPopup
          order={detailOrder}
          gestor={gestorMap[detailOrder.gestorId]}
          onClose={() => setDetailOrder(null)}
        />
      )}
    </main>
  );
}
