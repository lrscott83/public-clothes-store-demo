import { formatMoney } from '@store-mgmt/storefront/config';
import type { FinanceStateRow } from '../../domain/finanzas';

export interface StateBreakdownTableProps {
  rows: FinanceStateRow[];
}

const MONEY = { locale: 'en-US', currency: 'USD' } as const;

/**
 * Per-state cash-flow table — always exactly 5 rows (one per `OrderState`,
 * fixed order), built by the domain layer from the exhaustive label map, not
 * from the order list. Revenue is USD via `formatMoney`; commission is
 * native MN plain `{value} MN` text — NEVER `formatMoney` (MN is not ISO
 * currency). The `creado` row has no frozen commission, so its cell renders
 * "—" instead of `0 MN`. Heading text deliberately avoids the word
 * "finanzas" so `routes.test.tsx`'s `getByRole('heading', { name:
 * /finanzas/i })` stays unambiguous.
 */
export function StateBreakdownTable({ rows }: StateBreakdownTableProps) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-text">Flujo por estado</h2>
      <div className="mt-2 max-h-96 overflow-y-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-surface">
            <tr>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Pedidos</th>
              <th className="px-3 py-2">Ingresos</th>
              <th className="px-3 py-2">Comisión</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.state} className="border-t border-border">
                <td className="px-3 py-2">{row.label}</td>
                <td className="px-3 py-2">{row.count}</td>
                <td className="px-3 py-2">{formatMoney(row.revenueUSD, MONEY)}</td>
                <td className="px-3 py-2">{row.state === 'creado' ? '—' : `${row.commissionMN} MN`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
