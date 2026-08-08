import { useState } from 'react';
import type { InventorySortKey, SortDirection, WarehouseInventory } from '../../domain/inventory';
import { filterInventoryRows, inventoryCategories, sortInventoryRows } from '../../domain/inventory';
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
 *
 * View-only controls (local `useState`, pure domain helpers — never mutate the
 * domain-provided `warehouse.rows`):
 * - Free-text search (by product name) + category select filter the rows.
 * - Column headers are sort buttons; every header shows an arrow indicator
 *   (`↕` when inactive, `▲`/`▼` on the active column), and the active header
 *   carries `aria-sort`. Clicking a column sorts ascending, then toggles.
 *
 * Heading is the warehouse NAME (never the word "Inventario") so
 * `getAllByRole('heading')` stays unambiguous alongside the page h1. Table sits
 * in a fixed-height scroll container so ~99-row tables don't produce an
 * unbounded page. Filters/sort are reset per warehouse by remounting (the
 * parent keys this component on `warehouseId`).
 */
export function WarehouseDetail({ warehouse }: WarehouseDetailProps) {
  const [sort, setSort] = useState<SortState | null>(null);
  const [text, setText] = useState('');
  const [categoryId, setCategoryId] = useState('');

  const categories = inventoryCategories(warehouse.rows);
  const filtered = filterInventoryRows(warehouse.rows, { text, categoryId });
  const rows = sort ? sortInventoryRows(filtered, sort.key, sort.direction) : filtered;

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

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <input
          type="search"
          aria-label="Buscar producto"
          placeholder="Buscar producto…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-w-[200px] flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text"
        />
        <select
          aria-label="Filtrar por categoría"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text"
        >
          <option value="">Todas las categorías</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>

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
                const indicator = active ? (sort!.direction === 'asc' ? '▲' : '▼') : '↕';
                return (
                  <th key={key} scope="col" aria-sort={ariaSort} className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleSort(key)}
                      className="flex items-center gap-1 font-semibold text-text hover:text-accent"
                    >
                      <span>{label}</span>
                      <span
                        aria-hidden="true"
                        className={`text-xs ${active ? 'text-accent' : 'text-text-muted'}`}
                      >
                        {indicator}
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
