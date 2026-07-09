import { formatMoney } from '@store-mgmt/storefront/config';
import type { ProfitabilityTotals } from '../../domain/decisiones';

export interface ProfitabilitySummaryProps {
  totals: ProfitabilityTotals;
  count: number;
}

const MONEY = { locale: 'en-US', currency: 'USD' } as const;

/**
 * Grand-total block for the profitability ranking ("Resumen de
 * rentabilidad"). Every figure is USD and goes through `formatMoney` — never
 * manual "$" + toFixed. The margin figure gets a visible loss emphasis
 * (distinct color class) when `totals.marginUSD < 0`. Heading text
 * deliberately avoids the word "decisiones" so `routes.test.tsx`'s
 * `getByRole('heading', { name: /decisiones/i })` stays unambiguous.
 */
export function ProfitabilitySummary({ totals, count }: ProfitabilitySummaryProps) {
  const marginClassName = totals.marginUSD < 0 ? 'text-red-600' : 'text-text';

  return (
    <section className="mt-4">
      <div className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-lg font-semibold text-text">Resumen de rentabilidad</h2>
        <dl className="mt-2 flex flex-wrap gap-6">
          <div>
            <dt className="text-sm text-text-muted">Pedidos</dt>
            <dd className="text-lg font-bold text-text">{count}</dd>
          </div>
          <div>
            <dt className="text-sm text-text-muted">Ingresos</dt>
            <dd className="text-lg font-bold text-text">{formatMoney(totals.revenueUSD, MONEY)}</dd>
          </div>
          <div>
            <dt className="text-sm text-text-muted">Costo</dt>
            <dd className="text-lg font-bold text-text">{formatMoney(totals.costUSD, MONEY)}</dd>
          </div>
          <div>
            <dt className="text-sm text-text-muted">Comisión</dt>
            <dd className="text-lg font-bold text-text">{formatMoney(totals.commissionUSD, MONEY)}</dd>
          </div>
          <div>
            <dt className="text-sm text-text-muted">Margen</dt>
            <dd className={`text-lg font-bold ${marginClassName}`}>{formatMoney(totals.marginUSD, MONEY)}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
