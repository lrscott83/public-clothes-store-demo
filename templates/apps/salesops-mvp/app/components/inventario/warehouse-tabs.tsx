import { useState } from 'react';
import type { WarehouseInventory } from '../../domain/inventory';
import { WarehouseDetail } from './warehouse-detail';

export interface WarehouseTabsProps {
  warehouses: WarehouseInventory[];
}

/**
 * Tabbed view of the per-warehouse product tables: one `role="tab"` per
 * warehouse (label = warehouse name), showing a single `WarehouseDetail` at a
 * time instead of the previous vertical stack. Purely presentational tab state
 * (`useState`) — no data mutation, so it stays inside the read-only Inventario
 * screen. The tab triggers carry `role="tab"` (not the default button role) so
 * they read as view navigation, not a mutating control.
 */
export function WarehouseTabs({ warehouses }: WarehouseTabsProps) {
  const [activeId, setActiveId] = useState(warehouses[0]?.warehouseId);
  const active = warehouses.find((w) => w.warehouseId === activeId) ?? warehouses[0];

  if (!active) return null;

  return (
    <div>
      <div role="tablist" aria-label="Almacenes" className="flex flex-wrap gap-2 border-b border-border">
        {warehouses.map((warehouse) => {
          const selected = warehouse.warehouseId === active.warehouseId;
          return (
            <button
              key={warehouse.warehouseId}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActiveId(warehouse.warehouseId)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                selected
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-muted hover:text-text'
              }`}
            >
              {warehouse.warehouseName}
            </button>
          );
        })}
      </div>
      <div className="mt-4">
        <WarehouseDetail warehouse={active} />
      </div>
    </div>
  );
}
