import { formatMoney } from '@store-mgmt/storefront/config';
import type { ProfitabilityRow } from '../../domain/decisiones';

export interface ProfitabilityTableProps {
  rows: ProfitabilityRow[];
}

const MONEY = { locale: 'en-US', currency: 'USD' } as const;

/**
 * Ranked profitability table — one row per order, already sorted by the
 * domain builder (margin descending, tie-break by orderId). Every USD
 * figure goes through `formatMoney`. A negative-margin row renders an
 * inline "Pérdida" tag; no tag when the row isn't a loss. Renders the
 * table shell even with zero rows — the true empty-state message is the
 * container's responsibility, not this component's. Heading text
 * deliberately avoids the word "decisiones" so `routes.test.tsx`'s
 * `getByRole('heading', { name: /decisiones/i })` stays unambiguous.
 */
export function ProfitabilityTable({ rows }: ProfitabilityTableProps) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-text">Ranking de rentabilidad de pedidos</h2>
      <div className="mt-2 max-h-96 overflow-y-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-surface">
            <tr>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Ingresos</th>
              <th className="px-3 py-2">Costo</th>
              <th className="px-3 py-2">Comisión</th>
              <th className="px-3 py-2">Margen</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.orderId} className="border-t border-border">
                <td className="px-3 py-2">{row.label}</td>
                <td className="px-3 py-2">{formatMoney(row.revenueUSD, MONEY)}</td>
                <td className="px-3 py-2">{formatMoney(row.costUSD, MONEY)}</td>
                <td className="px-3 py-2">{formatMoney(row.commissionUSD, MONEY)}</td>
                <td className={`px-3 py-2 ${row.isLoss ? 'text-red-600' : ''}`}>
                  {formatMoney(row.marginUSD, MONEY)}
                </td>
                <td className="px-3 py-2">
                  {row.isLoss && (
                    <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      Pérdida
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
