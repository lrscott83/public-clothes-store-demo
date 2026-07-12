import { formatMoney } from '@store-mgmt/storefront/config';
import type { ProfitabilityRow } from '../../domain/decisiones';

export interface LowestMarginOrdersProps {
  rows: ProfitabilityRow[];
}

const MONEY = { locale: 'en-US', currency: 'USD' } as const;

/**
 * Layer 3c-ii — "Pedidos de menor margen": reuses `buildProfitabilityRanking`
 * rows unchanged (the domain builder already re-sorts ascending, lowest
 * margin first) — this leaf renders them in the given order, with NO
 * "pérdida"/"loss" label or styling, even when `isLoss` is `true`. The
 * framing here is strictly a lower-margin ranking, not a loss report.
 */
export function LowestMarginOrders({ rows }: LowestMarginOrdersProps) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h2 className="text-lg font-semibold text-text">Pedidos de menor margen</h2>
      <div className="mt-2 max-h-72 overflow-y-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-surface">
            <tr>
              <th className="px-2 py-1">Cliente</th>
              <th className="px-2 py-1">Ingresos</th>
              <th className="px-2 py-1">Margen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.orderId} className="border-t border-border">
                <td className="px-2 py-1">{row.label}</td>
                <td className="px-2 py-1">{formatMoney(row.revenueUSD, MONEY)}</td>
                <td className="px-2 py-1">{formatMoney(row.marginUSD, MONEY)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
