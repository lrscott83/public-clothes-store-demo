import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { WarehouseTabs } from '../warehouse-tabs';
import type { WarehouseInventory } from '../../../domain/inventory';

function buildWarehouse(
  warehouseId: string,
  warehouseName: string,
  productName: string,
): WarehouseInventory {
  return {
    warehouseId,
    warehouseName,
    totalUnits: 5,
    retailValueUSD: 50,
    costValueUSD: 20,
    rows: [
      {
        productId: `${warehouseId}-p1`,
        name: productName,
        categoryId: 'cat-a',
        quantity: 5,
        status: 'disponible',
      },
    ],
  };
}

const WAREHOUSES: WarehouseInventory[] = [
  buildWarehouse('wh-1', 'Pinar del Río', 'Alfa'),
  buildWarehouse('wh-2', 'Consolación del Sur', 'Beta'),
  buildWarehouse('wh-3', 'Herradura', 'Gamma'),
];

describe('WarehouseTabs', () => {
  it('renders one tab per warehouse, labeled with the warehouse name in order', () => {
    render(<WarehouseTabs warehouses={WAREHOUSES} />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual([
      'Pinar del Río',
      'Consolación del Sur',
      'Herradura',
    ]);
  });

  it('shows only the first warehouse detail by default', () => {
    render(<WarehouseTabs warehouses={WAREHOUSES} />);

    expect(screen.getByRole('heading', { name: 'Pinar del Río' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Herradura' })).toBeNull();
    expect(screen.getByText('Alfa')).toBeInTheDocument();
    expect(screen.queryByText('Gamma')).toBeNull();
  });

  it('marks the first tab selected (aria-selected) by default', () => {
    render(<WarehouseTabs warehouses={WAREHOUSES} />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
  });

  it('switches the visible warehouse detail when another tab is clicked', async () => {
    const user = userEvent.setup();
    render(<WarehouseTabs warehouses={WAREHOUSES} />);

    await user.click(screen.getByRole('tab', { name: 'Herradura' }));

    expect(screen.getByRole('heading', { name: 'Herradura' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pinar del Río' })).toBeNull();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
    expect(screen.queryByText('Alfa')).toBeNull();
  });
});
