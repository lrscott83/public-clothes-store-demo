import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LowestMarginOrders } from '../lowest-margin-orders';
import type { ProfitabilityRow } from '../../../domain/decisiones';

function row(orderId: string, marginUSD: number, isLoss = false): ProfitabilityRow {
  return {
    orderId,
    label: `Cliente ${orderId}`,
    revenueUSD: 100,
    costUSD: 40,
    commissionUSD: 10,
    marginUSD,
    marginPercent: 50,
    isLoss,
  };
}

describe('LowestMarginOrders', () => {
  it('renders rows ascending by marginUSD (lowest first), input order unchanged', () => {
    const rows = [row('a', 50), row('b', 100), row('c', 300)];
    render(<LowestMarginOrders rows={rows} />);

    const bodyRows = screen.getAllByRole('row').slice(1); // skip header row
    const margins = bodyRows.map((tr) => tr.querySelectorAll('td')[2]?.textContent);
    expect(margins).toEqual(['$50.00', '$100.00', '$300.00']);
  });

  it('never shows "pérdida"/"loss" language even when isLoss is true', () => {
    const rows = [row('a', -20, true)];
    const { container } = render(<LowestMarginOrders rows={rows} />);
    const text = container.textContent?.toLowerCase() ?? '';
    expect(text).not.toContain('pérdida');
    expect(text).not.toContain('loss');
  });

  it('heading "Pedidos de menor margen" has no "decisiones"', () => {
    render(<LowestMarginOrders rows={[row('a', 50)]} />);
    expect(screen.getByText('Pedidos de menor margen').textContent?.toLowerCase()).not.toContain('decisiones');
  });
});
