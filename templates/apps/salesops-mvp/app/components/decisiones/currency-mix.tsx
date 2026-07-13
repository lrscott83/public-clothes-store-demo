import { DonutChart } from '../charts/donut-chart';
import { InfoPopover } from './info-popover';
import { DECISIONES_HELP } from './help-content';
import type { CurrencyMixView } from '../../domain/decisiones-dashboard';

export interface CurrencyMixProps {
  currencyMix: CurrencyMixView;
}

/**
 * Layer 2d — "Mix por moneda": one donut slice per payment method (USD, MN,
 * ZELLE, EUR, and an "otros" catch-all bucket when present). Legend shows
 * label + share, computed by the chart primitive itself.
 */
export function CurrencyMix({ currencyMix }: CurrencyMixProps) {
  const slices = currencyMix.buckets.map((bucket) => ({ label: bucket.method, value: bucket.count }));

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5">
        <h2 className="text-lg font-semibold text-text">Mix por moneda</h2>
        <InfoPopover {...DECISIONES_HELP.mixPorMoneda} />
      </div>
      <div className="mt-2">
        <DonutChart slices={slices} ariaLabel="Mix por moneda / método de pago" />
      </div>
    </div>
  );
}
