import { formatMoney } from '@store-mgmt/storefront/config';
import { BarChart } from '../charts/bar-chart';
import { InfoPopover } from '../shared/info-popover';
import { FINANZAS_HELP } from './help-content';
import type { RevenueByStateView } from '../../domain/finanzas-dashboard';

export interface RevenueByStateBarsProps {
  revenueByState: RevenueByStateView;
}

const MONEY = { locale: 'en-US', currency: 'USD' } as const;

/**
 * Layer 2c — "Ingresos por estado": one horizontal bar per `OrderState`
 * (fixed order, zero-count states included — reuses `buildFinanceSummary`'s
 * unchanged rows), revenue formatted via `formatMoney`.
 */
export function RevenueByStateBars({ revenueByState }: RevenueByStateBarsProps) {
  const bars = revenueByState.rows.map((row) => ({ label: row.label, value: row.revenueUSD }));

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5">
        <h2 className="text-lg font-semibold text-text">Ingresos por estado</h2>
        <InfoPopover {...FINANZAS_HELP.ingresosPorEstado} />
      </div>
      <div className="mt-2">
        <BarChart
          bars={bars}
          orientation="horizontal"
          ariaLabel="Ingresos por estado"
          formatValue={(value) => formatMoney(value, MONEY)}
        />
      </div>
    </div>
  );
}
