import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InventoryAlerts } from '../inventory-alerts';
import type { InventoryAlertsView } from '../../../domain/decisiones-dashboard';

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
});
