import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ActiveOrdersChart } from '../active-orders-chart';
import type { ActiveOrdersView } from '../../../domain/decisiones-dashboard';

const ACTIVE_ORDERS: ActiveOrdersView = {
  groups: [
    {
      state: 'creado',
      label: 'Creado',
      total: 3,
      cells: [
        { warehouseId: 'wh-1', warehouseName: 'Pinar del Río', count: 2 },
        { warehouseId: 'wh-2', warehouseName: 'Consolación del Sur', count: 1 },
        { warehouseId: 'wh-3', warehouseName: 'Herradura', count: 0 },
      ],
    },
    {
      state: 'verificado',
      label: 'Verificado',
      total: 1,
      cells: [
        { warehouseId: 'wh-1', warehouseName: 'Pinar del Río', count: 0 },
        { warehouseId: 'wh-2', warehouseName: 'Consolación del Sur', count: 1 },
        { warehouseId: 'wh-3', warehouseName: 'Herradura', count: 0 },
      ],
    },
    {
      state: 'transportando',
      label: 'Transportando',
      total: 0,
      cells: [
        { warehouseId: 'wh-1', warehouseName: 'Pinar del Río', count: 0 },
        { warehouseId: 'wh-2', warehouseName: 'Consolación del Sur', count: 0 },
        { warehouseId: 'wh-3', warehouseName: 'Herradura', count: 0 },
      ],
    },
  ],
};

describe('ActiveOrdersChart', () => {
  it('renders exactly the 3 non-completed state labels, no entregado/comisión pagada', () => {
    render(<ActiveOrdersChart activeOrders={ACTIVE_ORDERS} />);

    expect(screen.getByText('Creado')).toBeInTheDocument();
    expect(screen.getByText('Verificado')).toBeInTheDocument();
    expect(screen.getByText('Transportando')).toBeInTheDocument();
    expect(screen.queryByText('Entregado')).not.toBeInTheDocument();
    expect(screen.queryByText('Comisión pagada')).not.toBeInTheDocument();
  });

  it('renders one bar per (state, warehouse) cell, zero-padded, colored by the fixed warehouse color', () => {
    const { container } = render(<ActiveOrdersChart activeOrders={ACTIVE_ORDERS} />);

    const bars = container.querySelectorAll('[data-warehouse]');
    expect(bars).toHaveLength(9); // 3 states x 3 warehouses, zero-count pairs included

    const wh1Bars = container.querySelectorAll('[data-warehouse="wh-1"]');
    expect(wh1Bars).toHaveLength(3);
    wh1Bars.forEach((bar) => {
      expect(bar).toHaveStyle({ backgroundColor: '#16a34a' });
    });

    const wh3Bars = container.querySelectorAll('[data-warehouse="wh-3"]');
    wh3Bars.forEach((bar) => {
      expect(bar).toHaveStyle({ backgroundColor: '#eab308' });
    });
  });

  it('shows the zero-count total for a fully-empty state group', () => {
    render(<ActiveOrdersChart activeOrders={ACTIVE_ORDERS} />);

    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
  });

  it('has no "decisiones" in the heading', () => {
    render(<ActiveOrdersChart activeOrders={ACTIVE_ORDERS} />);

    expect(screen.getByText('Pedidos activos por estado y almacén').textContent?.toLowerCase()).not.toContain(
      'decisiones',
    );
  });
});
