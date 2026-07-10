import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WarehouseDetail } from '../warehouse-detail';
import type { WarehouseInventory } from '../../../domain/inventory';

function buildWarehouse(): WarehouseInventory {
  return {
    warehouseId: 'wh-1',
    warehouseName: 'Pinar del Río',
    totalUnits: 8,
    retailValueUSD: 80,
    costValueUSD: 32,
    rows: [
      { productId: 'p-2', name: 'Alfa', categoryId: 'cat-a', quantity: 5, status: 'disponible' },
      { productId: 'p-3', name: 'Beta', categoryId: 'cat-a', quantity: 0, status: 'agotado' },
      { productId: 'p-1', name: 'Zeta', categoryId: 'cat-b', quantity: 3, status: 'disponible' },
    ],
  };
}

describe('WarehouseDetail', () => {
  it('renders an h2 with the warehouse name (not "Inventario")', () => {
    render(<WarehouseDetail warehouse={buildWarehouse()} />);

    const heading = screen.getByRole('heading', { name: 'Pinar del Río' });
    expect(heading.tagName).toBe('H2');
  });

  it('renders a table with headers Producto/Categoría/Unidades/Estado', () => {
    render(<WarehouseDetail warehouse={buildWarehouse()} />);

    const table = screen.getByRole('table');
    expect(within(table).getByText('Producto')).toBeInTheDocument();
    expect(within(table).getByText('Categoría')).toBeInTheDocument();
    expect(within(table).getByText('Unidades')).toBeInTheDocument();
    expect(within(table).getByText('Estado')).toBeInTheDocument();
  });

  it('renders rows in the given (already-sorted) order, each with a matching StockBadge', () => {
    render(<WarehouseDetail warehouse={buildWarehouse()} />);

    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row').slice(1); // drop header row
    expect(rows).toHaveLength(3);

    expect(within(rows[0]).getByText('Alfa')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Disponible')).toBeInTheDocument();

    expect(within(rows[1]).getByText('Beta')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Agotado')).toBeInTheDocument();

    expect(within(rows[2]).getByText('Zeta')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Disponible')).toBeInTheDocument();
  });
});
