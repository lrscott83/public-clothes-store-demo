import { useState } from 'react';
import type { InventorySortKey, SortDirection, WarehouseInventory } from '../../domain/inventory';
import { sortInventoryRows } from '../../domain/inventory';
import { StockBadge } from './stock-badge';

export interface WarehouseDetailProps {
  warehouse: WarehouseInventory;
}

interface SortState {
  key: InventorySortKey;
  direction: SortDirection;
}

const COLUMNS: { key: InventorySortKey; label: string }[] = [
  { key: 'name', label: 'Producto' },
  { key: 'categoryId', label: 'Categoría' },
  { key: 'quantity', label: 'Unidades' },
  { key: 'status', label: 'Estado' },
];

/**
 * Per-warehouse product detail table: Producto/Categoría/Unidades/Estado.
 * Column headers are sort buttons — clicking a column sorts by it (ascending
 * first, toggling to descending on repeat); the active header carries
 * `aria-sort`. Sorting is view-only (local `useState`, pure `sortInventoryRows`)
 * and never mutates the domain-provided `warehouse.rows`. Heading is the
 * warehouse NAME (never the word "Inventario") so `getAllByRole('heading')`
 * stays unambiguous alongside the page h1. Table sits in a fixed-height scroll
 * container so ~99-row tables don't produce an unbounded page.
 */
export function WarehouseDetail({ warehouse }: WarehouseDetailProps) {
  const [sort, setSort] = useState<SortState | null>(null);

  const rows = sort ? sortInventoryRows(warehouse.rows, sort.key, sort.direction) : warehouse.rows;

  function toggleSort(key: InventorySortKey) {
    setSort((current) =>
      current?.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    );
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-text">{warehouse.warehouseName}</h2>
      <div className="mt-2 max-h-96 overflow-y-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-surface">
            <tr>
              {COLUMNS.map(({ key, label }) => {
                const active = sort?.key === key;
                const ariaSort = active
                  ? sort!.direction === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none';
                return (
                  <th key={key} scope="col" aria-sort={ariaSort} className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleSort(key)}
                      className="flex items-center gap-1 font-semibold text-text hover:text-accent"
                    >
                      <span>{label}</span>
                      <span aria-hidden="true" className="text-xs text-accent">
                        {active ? (sort!.direction === 'asc' ? '▲' : '▼') : ''}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
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
