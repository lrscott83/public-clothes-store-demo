import type { Warehouse } from '../../domain/types';

export interface WarehouseStepProps {
  eligible: Warehouse[];
  warehouseId: string | null;
  onSelect: (warehouseId: string) => void;
}

/**
 * Almacén step: lists only warehouses that fully cover the cart (computed
 * upstream by `eligibleWarehouses`, container-side). If zero warehouses
 * qualify, order creation is blocked with an explanatory message and
 * "Confirmar" stays disabled.
 */
export function WarehouseStep({ eligible, warehouseId, onSelect }: WarehouseStepProps) {

  return (
    <section className="p-8">
      <h2 className="text-xl font-semibold text-text">Almacén</h2>

      {eligible.length === 0 ? (
        <p className="mt-4 text-sm text-red-600">
          Ningún almacén tiene stock suficiente para cubrir este pedido.
        </p>
      ) : (
        <fieldset className="mt-4 flex flex-col gap-2 text-sm text-text">
          <legend>Almacén de despacho</legend>
          {eligible.map((warehouse) => (
            <label key={warehouse.id} className="flex items-center gap-2">
              <input
                type="radio"
                name="warehouseId"
                value={warehouse.id}
                checked={warehouseId === warehouse.id}
                onChange={() => onSelect(warehouse.id)}
              />
              {warehouse.name}
            </label>
          ))}
        </fieldset>
      )}

    </section>
  );
}
