import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InventorySummary } from '../inventory-summary';
import type { InventorySummary as InventorySummaryModel } from '../../../domain/inventory';

function buildSummary(): InventorySummaryModel {
  return {
    warehouses: [
      {
        warehouseId: 'wh-1',
        warehouseName: 'Pinar del Río',
        totalUnits: 10,
        retailValueUSD: 100,
        costValueUSD: 40,
        rows: [],
      },
      {
        warehouseId: 'wh-2',
        warehouseName: 'Consolación del Sur',
        totalUnits: 5,
        retailValueUSD: 50,
        costValueUSD: 20,
        rows: [],
      },
    ],
    totalUnits: 15,
    totalRetailValueUSD: 150,
    totalCostValueUSD: 60,
  };
}

describe('InventorySummary', () => {
  it('renders the grand-total block with "Valor de venta" / "Valor de costo" labels and formatted values', () => {
    render(<InventorySummary summary={buildSummary()} />);

    // "Valor de venta"/"Valor de costo" labels appear in the grand-total
    // block AND once per warehouse card — assert at least one of each.
    expect(screen.getAllByText(/valor de venta/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/valor de costo/i).length).toBeGreaterThan(0);
    // formatMoney(value, { locale: 'en-US', currency: 'USD' }) -> Intl "$150.00"
    expect(screen.getByText('$150.00')).toBeInTheDocument();
    expect(screen.getByText('$60.00')).toBeInTheDocument();
  });

  it('renders one summary block per warehouse with its own totals', () => {
    render(<InventorySummary summary={buildSummary()} />);

    expect(screen.getByText('Pinar del Río')).toBeInTheDocument();
    expect(screen.getByText('Consolación del Sur')).toBeInTheDocument();
    expect(screen.getByText('$100.00')).toBeInTheDocument();
    expect(screen.getByText('$40.00')).toBeInTheDocument();
    expect(screen.getByText('$50.00')).toBeInTheDocument();
    expect(screen.getByText('$20.00')).toBeInTheDocument();
  });
});
