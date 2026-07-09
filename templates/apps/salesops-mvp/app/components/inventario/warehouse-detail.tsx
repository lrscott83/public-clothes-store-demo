import type { WarehouseInventory } from '../../domain/inventory';
import { StockBadge } from './stock-badge';

export interface WarehouseDetailProps {
  warehouse: WarehouseInventory;
}

/**
 * Per-warehouse product detail table: Producto/Categoría/Unidades/Estado,
 * `warehouse.rows` (already sorted by categoryId then name). Heading is the
 * warehouse NAME (never the word "Inventario") so `getAllByRole('heading')`
 * stays unambiguous alongside the page h1. Table sits in a fixed-height
 * scroll container so ~99-row tables don't produce an unbounded page.
 */
export function WarehouseDetail({ warehouse }: WarehouseDetailProps) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-text">{warehouse.warehouseName}</h2>
      <div className="mt-2 max-h-96 overflow-y-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-surface">
            <tr>
              <th className="px-3 py-2">Producto</th>
              <th className="px-3 py-2">Categoría</th>
              <th className="px-3 py-2">Unidades</th>
              <th className="px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {warehouse.rows.map((row) => (
              <tr key={row.productId} className="border-t border-border">
                <td className="px-3 py-2">{row.name}</td>
                <td className="px-3 py-2">{row.categoryId}</td>
                <td className="px-3 py-2">{row.quantity}</td>
                <td className="px-3 py-2">
                  <StockBadge status={row.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
