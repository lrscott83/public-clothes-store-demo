import { InfoPopover } from '../shared/info-popover';
import { DECISIONES_HELP } from './help-content';
import { WAREHOUSE_COLORS } from './warehouse-colors';
import type { ActiveOrdersView } from '../../domain/decisiones-dashboard';

export interface ActiveOrdersChartProps {
  activeOrders: ActiveOrdersView;
}

/** Max pixel height for the tallest bar in a group; every other bar scales relative to it. */
const MAX_BAR_HEIGHT = 96;

/**
 * Capa 1.1 — "Pedidos activos por estado y almacén": a grouped bar chart,
 * one group per non-completed `OrderState` (fixed order, from the domain
 * builder), one bar per warehouse inside each group. Colors are keyed by
 * warehouseId via {@link WAREHOUSE_COLORS} — fixed per warehouse,
 * independent of data. Zero-count `(state, warehouse)` pairs still render
 * a bar (at minimum height), never omitted — the domain builder already
 * zero-pads them.
 */
export function ActiveOrdersChart({ activeOrders }: ActiveOrdersChartProps) {
  const max = Math.max(1, ...activeOrders.groups.flatMap((group) => group.cells.map((cell) => cell.count)));

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5">
        <h2 className="text-lg font-semibold text-text">Pedidos activos por estado y almacén</h2>
        <InfoPopover {...DECISIONES_HELP.pedidosActivos} />
      </div>
      <div
        role="img"
        aria-label="Pedidos activos por estado y almacén"
        className="mt-3 flex items-end justify-around gap-4"
      >
        {activeOrders.groups.map((group) => (
          <div key={group.state} className="flex flex-col items-center gap-1">
            <div className="flex items-end gap-1.5" style={{ height: MAX_BAR_HEIGHT }}>
              {group.cells.map((cell) => {
                const height = Math.max(2, Math.round((cell.count / max) * MAX_BAR_HEIGHT));
                return (
                  <div key={cell.warehouseId} className="flex h-full flex-col items-center justify-end">
                    <span className="text-[10px] text-text-muted">{cell.count}</span>
                    <div
                      data-warehouse={cell.warehouseId}
                      title={cell.warehouseName}
                      style={{ height, backgroundColor: WAREHOUSE_COLORS[cell.warehouseId] }}
                      className="w-4 rounded-t"
                    />
                  </div>
                );
              })}
            </div>
            <span className="text-xs font-medium text-text">{group.label}</span>
            <span className="text-[10px] text-text-muted">{group.total} total</span>
          </div>
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-3 text-xs">
        {activeOrders.groups[0]?.cells.map((cell) => (
          <li key={cell.warehouseId} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: WAREHOUSE_COLORS[cell.warehouseId] }}
            />
            <span className="text-text-muted">{cell.warehouseName}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
