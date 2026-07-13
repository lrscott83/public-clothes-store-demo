import { DonutChart } from '../charts/donut-chart';
import { InfoPopover } from '../shared/info-popover';
import { FINANZAS_HELP } from './help-content';
import type { CurrencyExposureView } from '../../domain/finanzas-dashboard';

export interface CurrencyExposureDonutProps {
  currencyExposure: CurrencyExposureView;
}

/**
 * Layer 2d — "Mix por moneda": one donut slice per payment method's
 * revenue share (financial angle: hard-currency USD/ZELLE/EUR vs local MN
 * exposure to FX/devaluation risk, computed by finance's OWN
 * `buildCurrencyExposure` — not decisiones' `buildCurrencyMix`).
 */
export function CurrencyExposureDonut({ currencyExposure }: CurrencyExposureDonutProps) {
  const slices = currencyExposure.slices.map((slice) => ({ label: slice.method, value: slice.revenueUSD }));

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5">
        <h2 className="text-lg font-semibold text-text">Mix por moneda</h2>
        <InfoPopover {...FINANZAS_HELP.mixPorMoneda} />
      </div>
      <div className="mt-2">
        <DonutChart slices={slices} ariaLabel="Mix por moneda — exposición cambiaria" />
      </div>
    </div>
  );
}
