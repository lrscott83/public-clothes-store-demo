import { formatMoney } from '@store-mgmt/storefront/config';
import { BarChart } from '../charts/bar-chart';
import { InfoPopover } from './info-popover';
import { DECISIONES_HELP } from './help-content';
import type { TopMarginView } from '../../domain/decisiones-dashboard';

export interface TopMarginProductsProps {
  topMargin: TopMarginView;
}

const MONEY = { locale: 'en-US', currency: 'USD' } as const;

/** How many products the ranking shows — it's a "top N", not the full catalog. */
const TOP_N = 8;
/** Keep labels short enough to sit in the chart's fixed label gutter without overrunning the bars. */
const MAX_LABEL = 22;

function truncate(name: string): string {
  return name.length > MAX_LABEL ? `${name.slice(0, MAX_LABEL - 1).trimEnd()}…` : name;
}

/**
 * Layer 3b — "Top productos por margen": the top {@link TOP_N} products ranked
 * by aggregate margin USD (not revenue), sorted desc by the domain builder.
 * Products with no qualifying sales are already excluded upstream. Long names
 * are truncated at the leaf so they don't overrun the bars.
 */
export function TopMarginProducts({ topMargin }: TopMarginProductsProps) {
  const bars = topMargin.rows.slice(0, TOP_N).map((row) => ({ label: truncate(row.name), value: row.marginUSD }));

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5">
        <h2 className="text-lg font-semibold text-text">Top productos por margen</h2>
        <InfoPopover {...DECISIONES_HELP.topProductosMargen} />
      </div>
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
