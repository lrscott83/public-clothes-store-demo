import type { Order, OrderState } from '../../domain/types';
import { OrderColumn } from './order-column';

export interface KanbanBoardProps {
  orders: Order[];
  onRevisar: (id: string) => void;
  onMarkPaid: (id: string) => void;
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
 * Read-only 5-column board — no drag & drop. Orders move columns only via
 * the "Revisar"/"Marcar comisión pagada" actions surfaced by `OrderCard`.
 */
export function KanbanBoard({ orders, onRevisar, onMarkPaid }: KanbanBoardProps) {
  return (
    <div className="mt-4 flex gap-4 overflow-x-auto">
      {COLUMN_ORDER.map((state) => (
        <OrderColumn
          key={state}
          title={COLUMN_TITLES[state]}
          state={state}
          orders={orders.filter((order) => order.state === state)}
          onRevisar={onRevisar}
          onMarkPaid={onMarkPaid}
        />
      ))}
    </div>
  );
}
