import { useEffect, useRef } from 'react';
import { MoreVertical, MessageCircle } from 'lucide-react';
import type { Gestor, Order, OrderState } from '../../../domain/types';

interface GestorOrderCardProps {
  order: Order;
  gestor?: Gestor;
  onDetalles: (order: Order) => void;
  onVerifyOrder: (id: string) => void;
  onMarkCommissionPaid: (id: string) => void;
  isMenuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
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

export function GestorOrderCard({
  order,
  gestor,
  onDetalles,
  onVerifyOrder,
  onMarkCommissionPaid,
  isMenuOpen,
  onToggleMenu,
  onCloseMenu,
}: GestorOrderCardProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const digits = gestor?.phone?.replace(/\D/g, '');

  // Click-outside + Escape handling
  useEffect(() => {
    if (!isMenuOpen) return;

    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onCloseMenu();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseMenu();
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isMenuOpen, onCloseMenu]);

  return (
    <div ref={menuRef} className="relative">
      {/* Card */}
      <div className="rounded-lg border border-border bg-surface p-4 transition-shadow hover:shadow-md">
        {/* Row 1: Gestor name + ⋮ button */}
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text">
              {gestor ? gestor.name : 'Sin asignar'}
            </p>
          </div>
          <button
            type="button"
            onClick={onToggleMenu}
            aria-label="Acciones"
            data-testid="menu-toggle"
            className="flex-shrink-0 rounded p-1 transition-colors hover:bg-accent/10"
          >
            <MoreVertical size={16} />
          </button>
        </div>

        {/* Row 2: Phone + WhatsApp link */}
        {digits && (
          <div className="mt-1">
            <a
              href={`https://wa.me/${digits}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-text-muted transition-colors hover:text-accent"
              aria-label="WhatsApp"
            >
              <MessageCircle size={14} />
              {gestor?.phone}
            </a>
          </div>
        )}

        {/* Row 3: Client name */}
        <p className="mt-2 text-sm text-text-muted">{order.client.name}</p>

        {/* Row 4: Totals */}
        <div className="mt-2 flex items-center gap-3 text-sm">
          <span className="font-medium text-text">
            ${order.totalUSD.toFixed(2)}
          </span>
          {order.totalMN !== undefined && (
            <span className="text-text-muted">
              {order.totalMN.toLocaleString('en-US')} Mn
            </span>
          )}
        </div>

        {/* Row 5: State badge */}
        <div className="mt-2">
          <span
            data-testid="state-badge"
            style={BADGE_STYLES[order.state]}
            className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
          >
            {STATE_LABELS[order.state]}
          </span>
        </div>
      </div>

      {/* Dropdown menu */}
      {isMenuOpen && (
        <div
          data-testid="dropdown-menu"
          className="absolute right-0 top-1 z-50 mt-1 min-w-[160px] rounded-lg border border-border bg-surface shadow-lg"
        >
          <button
            type="button"
            onClick={() => {
              onDetalles(order);
              onCloseMenu();
            }}
            className="w-full cursor-pointer rounded-t-lg px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
          >
            Detalles
          </button>
          {order.state === 'creado' && (
            <button
              type="button"
              onClick={() => {
                onVerifyOrder(order.id);
                onCloseMenu();
              }}
              className="w-full cursor-pointer px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
            >
              Aceptar
            </button>
          )}
          {order.state === 'entregado' && (
            <button
              type="button"
              onClick={() => {
                onMarkCommissionPaid(order.id);
                onCloseMenu();
              }}
              className="w-full cursor-pointer rounded-b-lg px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
            >
              Pagar Comisión
            </button>
          )}
        </div>
      )}
    </div>
  );
}
