import type { StockStatus } from '../../domain/inventory';

export interface StockBadgeProps {
  status: StockStatus;
}

const STATUS_LABEL: Record<StockStatus, string> = {
  disponible: 'Disponible',
  agotado: 'Agotado',
};

const STATUS_CLASSNAME: Record<StockStatus, string> = {
  disponible: 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700',
  agotado: 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700',
};

/** Binary stock status pill — no intermediate/low-stock threshold state. */
export function StockBadge({ status }: StockBadgeProps) {
  return <span className={STATUS_CLASSNAME[status]}>{STATUS_LABEL[status]}</span>;
}
