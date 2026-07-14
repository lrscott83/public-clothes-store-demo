import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WarehouseRevenue } from '../warehouse-revenue';
import type { WarehouseRevenueView } from '../../../domain/finanzas-dashboard';

function buildView(): WarehouseRevenueView {
  return {
    rows: [
      { warehouseId: 'wh-1', warehouseName: 'Almacén 1', revenueUSD: 400, count: 2 },
      { warehouseId: 'wh-2', warehouseName: 'Almacén 2', revenueUSD: 0, count: 0 },
    ],
  };
}

describe('WarehouseRevenue', () => {
  it('renders one row per warehouse with revenueUSD/count, zero-order warehouse still present', () => {
    render(<WarehouseRevenue warehouseRevenue={buildView()} />);

    const table = screen.getByRole('table');
    const bodyRows = table.querySelectorAll('tbody tr');
    expect(bodyRows).toHaveLength(2);

    expect(screen.getByText('Almacén 1')).toBeInTheDocument();
    expect(screen.getByText('$400.00')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Almacén 2')).toBeInTheDocument();
    expect(screen.getByText('$0.00')).toBeInTheDocument();
  });

  it('renders a help affordance and heading', () => {
    render(<WarehouseRevenue warehouseRevenue={buildView()} />);

    expect(screen.getByText('Ventas por almacén')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /qué significa/i })).toBeInTheDocument();
  });
});
