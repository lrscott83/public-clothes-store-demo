import { formatMoney } from '@store-mgmt/storefront/config';
import { AreaTrend } from '../charts/area-trend';
import { InfoPopover } from '../shared/info-popover';
import { FINANZAS_HELP } from './help-content';
import type { RevenueTrendView } from '../../domain/finanzas-dashboard';

export interface RevenueTrendSectionProps {
  trend: RevenueTrendView;
}

const MONEY = { locale: 'en-US', currency: 'USD' } as const;

/**
 * Layer 2a — 20-day revenue trend, single unsplit series (every qualifying
 * order IS realized revenue; there is no cobrado/pendiente subset to
 * toggle between).
 */
export function RevenueTrendSection({ trend }: RevenueTrendSectionProps) {
  const points = trend.points.map((point) => ({
    label: `d-${point.dayOffset}`,
    value: point.revenueUSD,
  }));

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5">
        <h2 className="text-lg font-semibold text-text">Ventas por día (últimos 20 días)</h2>
        <InfoPopover {...FINANZAS_HELP.tendenciaVentas} />
      </div>
      <div className="mt-2">
        <AreaTrend points={points} ariaLabel="Ventas por día" formatValue={(value) => formatMoney(value, MONEY)} />
      </div>
    </div>
  );
}
