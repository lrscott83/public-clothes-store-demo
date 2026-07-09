import type { Order } from '../../domain/types';

export interface OrderCardProps {
  order: Order;
  onRevisar?: (id: string) => void;
  onMarkPaid?: (id: string) => void;
  onAsignarTransportista?: (id: string) => void;
  onMarcarEntregado?: (id: string) => void;
}

/**
 * Kanban card: summary sufficient to identify the order (id, client name,
 * totalUSD + frozen totalMN when present). Surfaces "Revisar" ONLY on
 * `creado` orders, "Marcar comisión pagada" ONLY on `entregado` orders,
 * "Asignar transportista" ONLY on `verificado` orders, and "Marcar entregado"
 * ONLY on `transportando` orders — every action is additionally gated on its
 * callback being supplied, so consumers that don't pass a given callback
 * never see its button (backward-compatible extension).
 */
export function OrderCard({ order, onRevisar, onMarkPaid, onAsignarTransportista, onMarcarEntregado }: OrderCardProps) {
  return (
    <li className="rounded-lg border border-border p-3 text-sm">
      <p className="font-medium text-text">{order.id}</p>
      <p className="text-text-muted">{order.client.name}</p>
      <p className="text-text-muted">${order.totalUSD}</p>
      {order.totalMN !== undefined && <p className="text-text-muted">{order.totalMN} MN</p>}

      {order.state === 'creado' && onRevisar && (
        <button
          type="button"
          onClick={() => onRevisar(order.id)}
          className="mt-2 rounded bg-primary px-3 py-1 text-white"
        >
          Revisar
        </button>
      )}

      {order.state === 'entregado' && onMarkPaid && (
        <button
          type="button"
          onClick={() => onMarkPaid(order.id)}
          className="mt-2 rounded bg-primary px-3 py-1 text-white"
        >
          Marcar comisión pagada
        </button>
      )}

      {order.state === 'verificado' && onAsignarTransportista && (
        <button
          type="button"
          onClick={() => onAsignarTransportista(order.id)}
          className="mt-2 rounded bg-primary px-3 py-1 text-white"
        >
          Asignar transportista
        </button>
      )}

      {order.state === 'transportando' && onMarcarEntregado && (
        <button
          type="button"
          onClick={() => onMarcarEntregado(order.id)}
          className="mt-2 rounded bg-primary px-3 py-1 text-white"
        >
          Marcar entregado
        </button>
      )}
    </li>
  );
}
