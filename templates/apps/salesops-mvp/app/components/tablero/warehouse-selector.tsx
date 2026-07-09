import type { Warehouse } from '../../domain/types';

export interface WarehouseSelectorProps {
  warehouses: Warehouse[];
  selectedWarehouseId: string;
  onSelect: (warehouseId: string) => void;
}

/**
 * Radio-fieldset warehouse selector for `operador-almacen`: always has a
 * selection (defaults to the first warehouse, handled by the container),
 * re-filters the board immediately on change — no `<select>`.
 */
export function WarehouseSelector({ warehouses, selectedWarehouseId, onSelect }: WarehouseSelectorProps) {
  return (
    <fieldset className="flex flex-col gap-2 text-sm text-text">
      <legend>Almacén</legend>
      {warehouses.map((warehouse) => (
        <label key={warehouse.id} className="flex items-center gap-2">
          <input
            type="radio"
            name="warehouseId"
            value={warehouse.id}
            checked={selectedWarehouseId === warehouse.id}
            onChange={() => onSelect(warehouse.id)}
          />
          {warehouse.name}
        </label>
      ))}
    </fieldset>
  );
}
