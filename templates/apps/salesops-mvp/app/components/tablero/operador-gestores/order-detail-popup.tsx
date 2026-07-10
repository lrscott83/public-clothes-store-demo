import { useEffect } from 'react';
import { X } from 'lucide-react';
import type { Gestor, Order, OrderState } from '../../../domain/types';
import { eligibleWarehouses } from '../../../domain/availability';
import { loadSeedState } from '../../../store/seed-store';
import { catalogProvider } from '../../../data/catalog';

interface OrderDetailPopupProps {
  order: Order;
  gestor?: Gestor;
  onClose: () => void;
}

const STATE_LABELS: Record<OrderState, string> = {
  creado: 'Creado',
  verificado: 'Verificado',
  transportando: 'Transportando',
  entregado: 'Entregado',
  comision_pagada: 'Comisión Pagada',
};

const BADGE_STYLES: Record<OrderState, { backgroundColor: string; color: string }> = {
  creado: { backgroundColor: '#E5E7EB', color: '#374151' },
  verificado: { backgroundColor: '#DBEAFE', color: '#1E40AF' },
  transportando: { backgroundColor: '#FEF3C7', color: '#92400E' },
  entregado: { backgroundColor: '#DCFCE7', color: '#166534' },
  comision_pagada: { backgroundColor: '#F3E8FF', color: '#6B21A8' },
};

export function OrderDetailPopup({ order, gestor, onClose }: OrderDetailPopupProps) {
  // Escape key handler
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Resolve the selected warehouse name and stock availability from seed state.
  let availableAtWarehouse: boolean | null = null;
  let warehouseName: string | null = null;
  try {
    const { inventory, warehouses } = loadSeedState();
    warehouseName =
      warehouses.find((warehouse) => warehouse.id === order.warehouseId)?.name ?? null;
    availableAtWarehouse = eligibleWarehouses(order.items, inventory, warehouses).some(
      (warehouse) => warehouse.id === order.warehouseId,
    );
  } catch {
    availableAtWarehouse = null;
  }

  const digits = gestor?.phone?.replace(/\D/g, '');

  return (
    <div
      data-testid="detail-popup"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-text">
              Detalle del pedido
            </h2>
            <div className="mt-2 flex items-center gap-3">
              <span
                style={BADGE_STYLES[order.state]}
                className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
              >
                {STATE_LABELS[order.state]}
              </span>
              <span className="text-xs text-text-muted">
                {new Date(order.createdAt).toLocaleDateString('es-CU', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded p-1 transition-colors hover:bg-accent/10"
          >
            <X size={20} />
          </button>
        </div>

        {/* Warehouse section — the selected warehouse, shown first */}
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-semibold text-text">Almacén</h3>
          <p className="text-sm text-text-muted">{warehouseName ?? order.warehouseId}</p>
          <p className="text-sm text-text-muted">
            {availableAtWarehouse === null
              ? 'Disponibilidad no verificada'
              : availableAtWarehouse
                ? 'Stock disponible en el almacén asignado.'
                : 'Stock insuficiente en el almacén asignado.'}
          </p>
        </div>

        {/* Client section */}
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-semibold text-text">Cliente</h3>
          <p className="text-sm text-text-muted">{order.client.name}</p>
          {order.client.phone && (
            <p className="text-sm text-text-muted">{order.client.phone}</p>
          )}
          {order.client.address && (
            <p className="text-sm text-text-muted">{order.client.address}</p>
          )}
          {order.client.deliveryMode && (
            <p className="text-sm text-text-muted">
              {order.client.deliveryMode === 'domicilio' ? 'A domicilio' : 'Recogida en tienda'}
            </p>
          )}
        </div>

        {/* Payment section */}
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-semibold text-text">Pago</h3>
          <p className="text-sm text-text-muted">Método: {order.payment.method}</p>
          <p className="text-sm text-text-muted">
            Total USD: ${order.totalUSD.toFixed(2)}
          </p>
          {order.totalMN !== undefined && (
            <p className="text-sm text-text-muted">
              Total MN: {order.totalMN.toLocaleString('en-US')} Mn
            </p>
          )}
        </div>

        {/* Gestor section */}
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-semibold text-text">Gestor</h3>
          {gestor ? (
            <>
              <p className="text-sm text-text-muted">{gestor.name}</p>
              {digits ? (
                <a
                  href={`https://wa.me/${digits}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-text-muted transition-colors hover:text-accent"
                >
                  {gestor.phone}
                </a>
              ) : (
                gestor.phone && <p className="text-sm text-text-muted">{gestor.phone}</p>
              )}
            </>
          ) : (
            <p className="text-sm text-text-muted">Sin asignar</p>
          )}
        </div>

        {/* Items section */}
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-semibold text-text">Artículos</h3>
          {order.items.length === 0 ? (
            <p className="text-sm text-text-muted">Sin artículos</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm text-text-muted">
              {order.items.map((item) => {
                const product = catalogProvider.getProductById(item.productId);
                const lineTotalUSD = item.priceUSD * item.quantity;
                return (
                  <li key={item.productId}>
                    {product?.name ?? item.productId} × {item.quantity} — ${lineTotalUSD.toFixed(2)}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Cerrar button */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border px-4 py-2 text-sm text-text transition-colors hover:bg-accent/10"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
