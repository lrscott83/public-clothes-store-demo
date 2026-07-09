import type { Order, OrderState } from '../../domain/types';
import { OrderColumn } from './order-column';

export interface KanbanBoardProps {
  orders: Order[];
  onRevisar?: (id: string) => void;
  onMarkPaid?: (id: string) => void;
  onAsignarTransportista?: (id: string) => void;
  onMarcarEntregado?: (id: string) => void;
  visibleStates?: OrderState[];
}

// Record keys are exhaustiveness-checked: if `OrderState` grows, this fails to
// compile until the new state gets a column title.
const COLUMN_TITLES: Record<OrderState, string> = {
  creado: 'Creado',
  verificado: 'Verificado',
  transportando: 'Transportando',
  entregado: 'Entregado',
  comision_pagada: 'Comisión pagada',
};

const COLUMN_ORDER: OrderState[] = [
  'creado',
  'verificado',
  'transportando',
  'entregado',
  'comision_pagada',
];

/**
 * Read-only kanban board — no drag & drop. Orders move columns only via the
 * per-state actions surfaced by `OrderCard`. Renders all 5 columns unless
 * `visibleStates` narrows the set (e.g. `operador-almacen` shows only 3).
 */
export function KanbanBoard({
  orders,
  onRevisar,
  onMarkPaid,
  onAsignarTransportista,
  onMarcarEntregado,
  visibleStates,
}: KanbanBoardProps) {
  return (
    <div className="mt-4 flex gap-4 overflow-x-auto">
      {(visibleStates ?? COLUMN_ORDER).map((state) => (
        <OrderColumn
          key={state}
          title={COLUMN_TITLES[state]}
          state={state}
          orders={orders.filter((order) => order.state === state)}
          onRevisar={onRevisar}
          onMarkPaid={onMarkPaid}
          onAsignarTransportista={onAsignarTransportista}
          onMarcarEntregado={onMarcarEntregado}
        />
      ))}
    </div>
  );
}
