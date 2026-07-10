import { useState } from 'react';
import type { Gestor, Order } from '../../../domain/types';
import { GestorOrderCard } from './gestor-order-card';

interface GestorOrderListProps {
  orders: Order[];
  gestorMap: Record<string, Gestor>;
  onDetalles: (order: Order) => void;
  onVerifyOrder: (id: string) => void;
  onMarkCommissionPaid: (id: string) => void;
}

export function GestorOrderList({
  orders,
  gestorMap,
  onDetalles,
  onVerifyOrder,
  onMarkCommissionPaid,
}: GestorOrderListProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const handleToggle = (id: string) => {
    setOpenMenuId((prev) => (prev === id ? null : id));
  };

  const handleCloseMenu = () => {
    setOpenMenuId(null);
  };

  return (
    <ul className="space-y-3" data-testid="order-list">
      {orders.length === 0 && (
        <li className="py-8 text-center text-sm text-text-muted">
          No hay pedidos registrados.
        </li>
      )}
      {orders.map((order) => (
        <li key={order.id} data-testid="order-card">
          <GestorOrderCard
            order={order}
            gestor={gestorMap[order.gestorId]}
            onDetalles={onDetalles}
            onVerifyOrder={onVerifyOrder}
            onMarkCommissionPaid={onMarkCommissionPaid}
            isMenuOpen={openMenuId === order.id}
            onToggleMenu={() => handleToggle(order.id)}
            onCloseMenu={handleCloseMenu}
          />
        </li>
      ))}
    </ul>
  );
}
