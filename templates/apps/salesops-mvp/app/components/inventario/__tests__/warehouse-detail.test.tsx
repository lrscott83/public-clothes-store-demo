import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { WarehouseDetail } from '../warehouse-detail';
import type { WarehouseInventory } from '../../../domain/inventory';

function bodyRowNames(): string[] {
  const table = screen.getByRole('table');
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0].textContent ?? '');
}

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

  it('renders every column header as a sort button', () => {
    render(<WarehouseDetail warehouse={buildWarehouse()} />);

    expect(screen.getByRole('button', { name: /producto/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /categoría/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /unidades/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /estado/i })).toBeInTheDocument();
  });

  it('shows a sort-arrow indicator on every column header, not just the active one', () => {
    render(<WarehouseDetail warehouse={buildWarehouse()} />);

    for (const label of ['Producto', 'Categoría', 'Unidades', 'Estado']) {
      const header = screen.getByRole('button', { name: new RegExp(label, 'i') });
      expect(header.textContent).toMatch(/[↕▲▼]/);
    }
  });

  it('sorts by Unidades ascending then descending on repeated clicks', async () => {
    const user = userEvent.setup();
    render(<WarehouseDetail warehouse={buildWarehouse()} />);
    // fixture quantities: Alfa 5, Beta 0, Zeta 3

    await user.click(screen.getByRole('button', { name: /unidades/i }));
    expect(bodyRowNames()).toEqual(['Beta', 'Zeta', 'Alfa']); // 0, 3, 5

    await user.click(screen.getByRole('button', { name: /unidades/i }));
    expect(bodyRowNames()).toEqual(['Alfa', 'Zeta', 'Beta']); // 5, 3, 0
  });

  it('reflects sort state via aria-sort on the active column header only', async () => {
    const user = userEvent.setup();
    render(<WarehouseDetail warehouse={buildWarehouse()} />);

    const unidades = screen.getByRole('columnheader', { name: /unidades/i });
    const producto = screen.getByRole('columnheader', { name: /producto/i });
    expect(unidades).toHaveAttribute('aria-sort', 'none');

    await user.click(screen.getByRole('button', { name: /unidades/i }));
    expect(unidades).toHaveAttribute('aria-sort', 'ascending');
    expect(producto).toHaveAttribute('aria-sort', 'none');

    await user.click(screen.getByRole('button', { name: /unidades/i }));
    expect(unidades).toHaveAttribute('aria-sort', 'descending');
  });

  it('filters rows by the free-text search (product name, case-insensitive)', async () => {
    const user = userEvent.setup();
    render(<WarehouseDetail warehouse={buildWarehouse()} />);

    await user.type(screen.getByRole('searchbox', { name: /buscar/i }), 'alf');
    expect(bodyRowNames()).toEqual(['Alfa']);
  });

  it('filters rows by the category select', async () => {
    const user = userEvent.setup();
    render(<WarehouseDetail warehouse={buildWarehouse()} />);
    // fixture categories: Alfa/Beta -> cat-a, Zeta -> cat-b

    await user.selectOptions(screen.getByRole('combobox', { name: /categoría/i }), 'cat-b');
    expect(bodyRowNames()).toEqual(['Zeta']);
  });

  it('offers each distinct warehouse category as a filter option', () => {
    render(<WarehouseDetail warehouse={buildWarehouse()} />);

    const select = screen.getByRole('combobox', { name: /categoría/i });
    const optionValues = within(select)
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value);
    expect(optionValues).toContain('cat-a');
    expect(optionValues).toContain('cat-b');
  });
});
