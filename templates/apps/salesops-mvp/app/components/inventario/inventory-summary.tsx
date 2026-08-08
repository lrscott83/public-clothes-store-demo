import { formatMoney } from '@store-mgmt/storefront/config';
import type { InventorySummary as InventorySummaryModel } from '../../domain/inventory';

export interface InventorySummaryProps {
  summary: InventorySummaryModel;
}

const MONEY = { locale: 'en-US', currency: 'USD' } as const;

/**
 * Grand-total block ("Resumen general") plus one summary card per
 * warehouse. Every money figure goes through `formatMoney` — never
 * `"$" + toFixed`. "Valor de venta" (retail) and "Valor de costo" (cost)
 * MUST stay visually distinguishable — never confuse them.
 */
export function InventorySummary({ summary }: InventorySummaryProps) {
  return (
    <section className="mt-4">
      <div className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-lg font-semibold text-text">Resumen general</h2>
        <dl className="mt-2 flex flex-wrap gap-6">
          <div>
            <dt className="text-sm text-text-muted">Total unidades</dt>
            <dd className="text-lg font-bold text-text">{summary.totalUnits}</dd>
          </div>
          <div>
            <dt className="text-sm text-text-muted">Valor de venta</dt>
            <dd className="text-lg font-bold text-text">{formatMoney(summary.totalRetailValueUSD, MONEY)}</dd>
          </div>
          <div>
            <dt className="text-sm text-text-muted">Valor de costo</dt>
            <dd className="text-lg font-bold text-text">{formatMoney(summary.totalCostValueUSD, MONEY)}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {summary.warehouses.map((warehouse) => (
          <div key={warehouse.warehouseId} className="rounded-lg border border-border bg-surface p-4">
            <h3 className="font-semibold text-text">{warehouse.warehouseName}</h3>
            <dl className="mt-2 flex flex-col gap-1">
              <div className="flex justify-between text-sm">
                <dt className="text-text-muted">Unidades</dt>
                <dd className="text-text">{warehouse.totalUnits}</dd>
              </div>
              <div className="flex justify-between text-sm">
                <dt className="text-text-muted">Valor de venta</dt>
                <dd className="text-text">{formatMoney(warehouse.retailValueUSD, MONEY)}</dd>
              </div>
              <div className="flex justify-between text-sm">
                <dt className="text-text-muted">Valor de costo</dt>
                <dd className="text-text">{formatMoney(warehouse.costValueUSD, MONEY)}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}
