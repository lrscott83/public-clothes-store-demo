import { InfoPopover } from '../shared/info-popover';
import { DECISIONES_HELP } from './help-content';
import type { InventoryAlertRow, InventoryAlertsView, StockAlertLevel } from '../../domain/decisiones-dashboard';

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

/** Urgency rank: agotado (out of stock) beats bajo (low). */
const LEVEL_RANK: Record<StockAlertLevel, number> = { agotado: 0, bajo: 1 };
/** Show only the most urgent handful per warehouse so the block doesn't dominate the dashboard. */
const MAX_PER_WAREHOUSE = 5;

/** Most urgent first: agotado before bajo, then lower stock first, then by name for stability. */
function byUrgency(a: InventoryAlertRow, b: InventoryAlertRow): number {
  return LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || a.quantity - b.quantity || a.name.localeCompare(b.name);
}

/**
 * Layer 3c-i — "Alertas de inventario": low/out-of-stock rows grouped by
 * warehouse. `StockBadge` only models the binary disponible/agotado pair, so
 * this leaf renders its own two-level pill (agotado/bajo) mirroring the same
 * visual convention. Warehouses with no alert rows are already omitted
 * upstream by the domain builder. Each warehouse shows only the
 * {@link MAX_PER_WAREHOUSE} most urgent rows (agotado first, lowest stock
 * first); the remainder collapse into a "+N más" line so the block stays scannable.
 */
export function InventoryAlerts({ alerts }: InventoryAlertsProps) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5">
        <h2 className="text-lg font-semibold text-text">Alertas de inventario</h2>
        <InfoPopover {...DECISIONES_HELP.alertasInventario} />
      </div>
      <div className="mt-2 flex flex-col gap-4">
        {alerts.groups.map((group) => {
          const sorted = [...group.rows].sort(byUrgency);
          const shown = sorted.slice(0, MAX_PER_WAREHOUSE);
          const hidden = sorted.length - shown.length;
          return (
            <div key={group.warehouseId}>
              <h3 className="text-sm font-semibold text-text">{group.warehouseName}</h3>
              <ul className="mt-1 flex flex-col gap-1">
                {shown.map((row) => (
                  <li key={row.productId} className="flex items-center justify-between text-sm">
                    <span className="text-text">{row.name}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-text-muted">{row.quantity}</span>
                      <span className={LEVEL_CLASSNAME[row.level]}>{LEVEL_LABEL[row.level]}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {hidden > 0 && <p className="mt-1 text-xs text-text-muted">+{hidden} más</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
