import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WarehouseSales } from '../warehouse-sales';
import type { WarehouseSalesView } from '../../../domain/decisiones-dashboard';

const WAREHOUSES: WarehouseSalesView = {
  rows: [
    { warehouseId: 'w1', warehouseName: 'Centro', revenueUSD: 500, count: 3 },
    { warehouseId: 'w2', warehouseName: 'Norte', revenueUSD: 0, count: 0 },
  ],
};

describe('WarehouseSales', () => {
  it('renders one bar per warehouse via BarChart, including a zero-sale warehouse at $0.00', () => {
    const { container } = render(<WarehouseSales warehouses={WAREHOUSES} />);
    expect(container.querySelectorAll('rect')).toHaveLength(2);
    expect(screen.getByText('Centro')).toBeInTheDocument();
    expect(screen.getByText('Norte')).toBeInTheDocument();
    expect(screen.getByText('$0.00')).toBeInTheDocument();
  });

  it('has no "decisiones" in the heading', () => {
    render(<WarehouseSales warehouses={WAREHOUSES} />);
    expect(screen.getByText('Ventas por almacén').textContent?.toLowerCase()).not.toContain('decisiones');
  });
});
