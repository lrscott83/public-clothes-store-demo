import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WarehouseCashFlow } from '../warehouse-cash-flow';
import type { WarehouseCashFlowView } from '../../../domain/finanzas-dashboard';

function buildView(): WarehouseCashFlowView {
  return {
    rows: [
      { warehouseId: 'wh-1', warehouseName: 'Almacén 1', cobradoUSD: 300, pendienteUSD: 100 },
      { warehouseId: 'wh-2', warehouseName: 'Almacén 2', cobradoUSD: 0, pendienteUSD: 0 },
    ],
  };
}

describe('WarehouseCashFlow', () => {
  it('renders one row per warehouse with cobrado/pendiente USD, zero-order warehouse still present', () => {
    render(<WarehouseCashFlow warehouseCashFlow={buildView()} />);

    const table = screen.getByRole('table');
    const bodyRows = table.querySelectorAll('tbody tr');
    expect(bodyRows).toHaveLength(2);

    expect(screen.getByText('Almacén 1')).toBeInTheDocument();
    expect(screen.getByText('$300.00')).toBeInTheDocument();
    expect(screen.getByText('$100.00')).toBeInTheDocument();
    expect(screen.getByText('Almacén 2')).toBeInTheDocument();
    expect(screen.getAllByText('$0.00').length).toBeGreaterThanOrEqual(2);
  });

  it('renders a help affordance and heading', () => {
    render(<WarehouseCashFlow warehouseCashFlow={buildView()} />);

    expect(screen.getByText('Cobros pendientes por almacén')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /qué significa/i })).toBeInTheDocument();
  });
});
