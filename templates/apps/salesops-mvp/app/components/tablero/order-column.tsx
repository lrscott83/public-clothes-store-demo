import type { Order, OrderState } from '../../domain/types';
import { OrderCard } from './order-card';

export interface OrderColumnProps {
  title: string;
  state: OrderState;
  orders: Order[];
  onRevisar?: (id: string) => void;
  onMarkPaid?: (id: string) => void;
  onAsignarTransportista?: (id: string) => void;
  onMarcarEntregado?: (id: string) => void;
}

/**
 * Single kanban column: header + order count, one `OrderCard` per order.
 * `orders` arrives already filtered to this column's state — no filtering
 * logic here.
 */
export function OrderColumn({
  title,
  state,
  orders,
  onRevisar,
  onMarkPaid,
  onAsignarTransportista,
  onMarcarEntregado,
}: OrderColumnProps) {
  return (
    <section data-state={state} className="flex min-w-[220px] flex-col gap-2 rounded-lg border border-border p-3">
      <h3 className="text-sm font-semibold text-text">
        {title} <span className="text-text-muted">({orders.length})</span>
      </h3>
      <ul className="flex flex-col gap-2">
        {orders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            onRevisar={onRevisar}
            onMarkPaid={onMarkPaid}
            onAsignarTransportista={onAsignarTransportista}
            onMarcarEntregado={onMarcarEntregado}
          />
        ))}
      </ul>
    </section>
  );
}
