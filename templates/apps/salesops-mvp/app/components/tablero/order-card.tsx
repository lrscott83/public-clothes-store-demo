import type { Order } from '../../domain/types';

export interface OrderCardProps {
  order: Order;
  onRevisar: (id: string) => void;
  onMarkPaid: (id: string) => void;
}

/**
 * Kanban card: summary sufficient to identify the order (id, client name,
 * totalUSD + frozen totalMN when present). Surfaces "Revisar" ONLY on
 * `creado` orders and "Marcar comisión pagada" ONLY on `entregado` orders —
 * other states render no action (read-only columns).
 */
export function OrderCard({ order, onRevisar, onMarkPaid }: OrderCardProps) {
  return (
    <li className="rounded-lg border border-border p-3 text-sm">
      <p className="font-medium text-text">{order.id}</p>
      <p className="text-text-muted">{order.client.name}</p>
      <p className="text-text-muted">${order.totalUSD}</p>
      {order.totalMN !== undefined && <p className="text-text-muted">{order.totalMN} MN</p>}

      {order.state === 'creado' && (
        <button
          type="button"
          onClick={() => onRevisar(order.id)}
          className="mt-2 rounded bg-primary px-3 py-1 text-white"
        >
          Revisar
        </button>
      )}

      {order.state === 'entregado' && (
        <button
          type="button"
          onClick={() => onMarkPaid(order.id)}
          className="mt-2 rounded bg-primary px-3 py-1 text-white"
        >
          Marcar comisión pagada
        </button>
      )}
    </li>
  );
}
