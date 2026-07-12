import { formatMoney } from '@store-mgmt/storefront/config';
import { BarChart } from '../charts/bar-chart';
import type { TopMarginView } from '../../domain/decisiones-dashboard';

export interface TopMarginProductsProps {
  topMargin: TopMarginView;
}

const MONEY = { locale: 'en-US', currency: 'USD' } as const;

/**
 * Layer 3b — "Top productos por margen": ranked by aggregate margin USD
 * (not revenue), sorted desc by the domain builder. Products with no
 * qualifying sales are already excluded upstream.
 */
export function TopMarginProducts({ topMargin }: TopMarginProductsProps) {
  const bars = topMargin.rows.map((row) => ({ label: row.name, value: row.marginUSD }));

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h2 className="text-lg font-semibold text-text">Top productos por margen</h2>
      <div className="mt-2">
        <BarChart
          bars={bars}
          orientation="horizontal"
          ariaLabel="Top productos por margen"
          formatValue={(value) => formatMoney(value, MONEY)}
        />
      </div>
    </div>
  );
}
