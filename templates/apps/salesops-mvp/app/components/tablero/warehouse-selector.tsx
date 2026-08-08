import type { Warehouse } from '../../domain/types';

export interface WarehouseSelectorProps {
  warehouses: Warehouse[];
  selectedWarehouseId: string;
  onSelect: (warehouseId: string) => void;
}

/**
 * Warehouse filter for `operador-almacen`, styled as the segmented button
 * group used by `ClientStep` ("Almacén de despacho"): one button per
 * warehouse, the selected one highlighted with the accent color. Always has a
 * selection (defaults to the first warehouse, handled by the container) and
 * re-filters the board immediately on click — no `<select>`, no radios.
 */
export function WarehouseSelector({ warehouses, selectedWarehouseId, onSelect }: WarehouseSelectorProps) {
  return (
    <div className="mt-4 rounded-lg border border-border bg-surface p-6">
      <h2 className="mb-4 text-lg font-semibold text-text">Almacén de despacho</h2>
      <div className="flex flex-wrap gap-3">
        {warehouses.map((warehouse) => {
          const selected = selectedWarehouseId === warehouse.id;
          return (
            <button
              key={warehouse.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(warehouse.id)}
              className={`min-w-[140px] flex-1 rounded-lg border-2 px-4 py-3 text-sm font-medium transition-colors ${
                selected
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border bg-surface text-text hover:border-text-muted'
              }`}
            >
              {warehouse.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
