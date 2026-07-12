import type { InventoryAlertsView, StockAlertLevel } from '../../domain/decisiones-dashboard';

export interface InventoryAlertsProps {
  alerts: InventoryAlertsView;
}

const LEVEL_LABEL: Record<StockAlertLevel, string> = {
  agotado: 'Agotado',
  bajo: 'Bajo',
};

const LEVEL_CLASSNAME: Record<StockAlertLevel, string> = {
  agotado: 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700',
  bajo: 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700',
};

/**
 * Layer 3c-i — "Alertas de inventario": low/out-of-stock rows grouped by
 * warehouse. `StockBadge` only models the binary disponible/agotado pair, so
 * this leaf renders its own two-level pill (agotado/bajo) mirroring the same
 * visual convention. Warehouses with no alert rows are already omitted
 * upstream by the domain builder.
 */
export function InventoryAlerts({ alerts }: InventoryAlertsProps) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h2 className="text-lg font-semibold text-text">Alertas de inventario</h2>
      <div className="mt-2 flex flex-col gap-4">
        {alerts.groups.map((group) => (
          <div key={group.warehouseId}>
            <h3 className="text-sm font-semibold text-text">{group.warehouseName}</h3>
            <ul className="mt-1 flex flex-col gap-1">
              {group.rows.map((row) => (
                <li key={row.productId} className="flex items-center justify-between text-sm">
                  <span className="text-text">{row.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-text-muted">{row.quantity}</span>
                    <span className={LEVEL_CLASSNAME[row.level]}>{LEVEL_LABEL[row.level]}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
