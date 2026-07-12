import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InventoryAlerts } from '../inventory-alerts';
import type { InventoryAlertRow, InventoryAlertsView } from '../../../domain/decisiones-dashboard';

const ALERTS: InventoryAlertsView = {
  groups: [
    {
      warehouseId: 'w1',
      warehouseName: 'Centro',
      rows: [
        { productId: 'p1', name: 'Camiseta', quantity: 0, level: 'agotado' },
        { productId: 'p2', name: 'Pantalón', quantity: 2, level: 'bajo' },
      ],
    },
  ],
};

describe('InventoryAlerts', () => {
  it('renders rows grouped by warehouse, agotado/bajo only', () => {
    render(<InventoryAlerts alerts={ALERTS} />);
    expect(screen.getByText('Centro')).toBeInTheDocument();
    expect(screen.getByText('Camiseta')).toBeInTheDocument();
    expect(screen.getByText('Pantalón')).toBeInTheDocument();
    expect(screen.getByText('Agotado')).toBeInTheDocument();
    expect(screen.getByText('Bajo')).toBeInTheDocument();
  });

  it('renders no groups (and no rows) when the alerts list is empty', () => {
    render(<InventoryAlerts alerts={{ groups: [] }} />);
    expect(screen.queryByText('Camiseta')).not.toBeInTheDocument();
  });

  it('has no "decisiones" in the heading', () => {
    render(<InventoryAlerts alerts={ALERTS} />);
    expect(screen.getByText('Alertas de inventario').textContent?.toLowerCase()).not.toContain('decisiones');
  });

  it('orders each group by urgency: agotado first, then lower quantity first', () => {
    const view: InventoryAlertsView = {
      groups: [
        {
          warehouseId: 'w1',
          warehouseName: 'Centro',
          rows: [
            { productId: 'p1', name: 'Tres', quantity: 3, level: 'bajo' },
            { productId: 'p2', name: 'Cero', quantity: 0, level: 'agotado' },
            { productId: 'p3', name: 'Uno', quantity: 1, level: 'bajo' },
          ],
        },
      ],
    };
    const { container } = render(<InventoryAlerts alerts={view} />);
    const names = Array.from(container.querySelectorAll('li')).map((li) => li.querySelector('span')?.textContent);
    expect(names).toEqual(['Cero', 'Uno', 'Tres']);
  });

  it('caps each warehouse at 5 rows and shows a "+N más" indicator for the rest', () => {
    const rows: InventoryAlertRow[] = Array.from({ length: 8 }, (_, i) => ({
      productId: `p${i}`,
      name: `Producto ${i}`,
      quantity: i === 0 ? 0 : 3,
      level: i === 0 ? 'agotado' : 'bajo',
    }));
    const view: InventoryAlertsView = { groups: [{ warehouseId: 'w1', warehouseName: 'Centro', rows }] };
    const { container } = render(<InventoryAlerts alerts={view} />);
    expect(container.querySelectorAll('li')).toHaveLength(5);
    expect(screen.getByText('+3 más')).toBeInTheDocument();
  });
});
