import type { Gestor, Order } from '../../domain/types';

export interface OrderReviewProps {
  order: Order;
  gestor: Gestor | undefined;
  availableAtWarehouse: boolean;
  onAceptar: () => void;
  onBack: () => void;
}

/**
 * Review-detail view for a `creado` order: items, client/delivery/payment
 * data, the assigned gestor's name + phone, and an INFORMATIONAL warehouse
 * availability line (never mutates inventory). "Aceptar" freezes the order
 * via the container's `verifyOrder` call.
 */
export function OrderReview({ order, gestor, availableAtWarehouse, onAceptar, onBack }: OrderReviewProps) {
  return (
    <section className="p-8">
      <h2 className="text-xl font-semibold text-text">Revisar pedido {order.id}</h2>

      <div className="mt-4">
        <h3 className="text-sm font-semibold text-text">Cliente</h3>
        <p className="text-sm text-text-muted">{order.client.name}</p>
        {order.client.phone && <p className="text-sm text-text-muted">{order.client.phone}</p>}
        {order.client.address && <p className="text-sm text-text-muted">{order.client.address}</p>}
        {order.client.deliveryMode && <p className="text-sm text-text-muted">{order.client.deliveryMode}</p>}
      </div>

      <div className="mt-4">
        <h3 className="text-sm font-semibold text-text">Pago</h3>
        <p className="text-sm text-text-muted">{order.payment.method}</p>
      </div>

      <div className="mt-4">
        <h3 className="text-sm font-semibold text-text">Gestor</h3>
        {gestor ? (
          <>
            <p className="text-sm text-text-muted">{gestor.name}</p>
            {gestor.phone && <p className="text-sm text-text-muted">{gestor.phone}</p>}
          </>
        ) : (
          <p className="text-sm text-text-muted">Sin asignar</p>
        )}
      </div>

      <div className="mt-4">
        <h3 className="text-sm font-semibold text-text">Artículos</h3>
        <ul className="mt-2 flex flex-col gap-1 text-sm text-text-muted">
          {order.items.map((item) => (
            <li key={item.productId}>
              {item.productId} × {item.quantity} — ${item.priceUSD}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-text-muted">Total: ${order.totalUSD}</p>
      </div>

      <p className="mt-4 text-sm text-text-muted">
        {availableAtWarehouse ? 'Stock disponible en el almacén asignado.' : 'Stock insuficiente en el almacén asignado.'}
      </p>

      <div className="mt-6 flex gap-3">
        <button type="button" onClick={onBack} className="rounded border border-border px-4 py-2">
          Atrás
        </button>
        <button type="button" onClick={onAceptar} className="rounded bg-primary px-4 py-2 text-white">
          Aceptar
        </button>
      </div>
    </section>
  );
}
