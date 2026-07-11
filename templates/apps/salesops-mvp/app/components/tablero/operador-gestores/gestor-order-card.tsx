import { useEffect, useRef, useState } from 'react';
import { MoreVertical, MessageCircle, X, Check, DollarSign } from 'lucide-react';
import type { Gestor, Order } from '../../../domain/types';

export interface GestorOrderCardProps {
  order: Order;
  gestor?: Gestor;
  onDetalles: (order: Order) => void;
  onVerifyOrder: (id: string) => void;
  onMarkCommissionPaid: (id: string) => void;
}

export function GestorOrderCard({ order, gestor, onDetalles, onVerifyOrder, onMarkCommissionPaid }: GestorOrderCardProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMenuOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMenuOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isMenuOpen]);

  const whatsappNumber = gestor?.phone?.replace(/\D/g, '');

  return (
    <div className="relative rounded-lg border border-border bg-surface p-4 text-sm shadow-sm hover:shadow-md transition-shadow">
      {/* Top row: gestor name + menu button */}
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-text truncate">
            {gestor?.name ?? order.gestorId}
          </p>
          {gestor?.phone && whatsappNumber && (
            <a
              href={`https://wa.me/${whatsappNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              {gestor.phone}
            </a>
          )}
        </div>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className="rounded p-1 hover:bg-accent hover:text-accent-foreground"
            aria-label="Acciones del pedido"
          >
            <MoreVertical className="h-4 w-4" />
          </button>

          {isMenuOpen && (
            <div className="absolute right-0 top-8 z-50 min-w-[160px] rounded-lg border border-border bg-surface shadow-lg">
              <button
                type="button"
                onClick={() => {
                  onDetalles(order);
                  setIsMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <X className="h-3.5 w-3.5" />
                Detalles
              </button>

              {order.state === 'creado' && (
                <button
                  type="button"
                  onClick={() => {
                    onVerifyOrder(order.id);
                    setIsMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <Check className="h-3.5 w-3.5" />
                  Aceptar
                </button>
              )}

              {order.state === 'entregado' && (
                <button
                  type="button"
                  onClick={() => {
                    onMarkCommissionPaid(order.id);
                    setIsMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <DollarSign className="h-3.5 w-3.5" />
                  Pagar Comisión
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Client name */}
      <p className="mt-2 text-text-muted">{order.client.name}</p>

      {/* Totals row */}
      <div className="mt-1 flex items-center gap-3 text-sm text-text-muted">
        <span>${order.totalUSD.toFixed(2)}</span>
        {order.payment.method === 'MN' && order.totalMN !== undefined && (
          <span>{Number(order.totalMN).toLocaleString('en-US')} MN</span>
        )}
      </div>
    </div>
  );
}
