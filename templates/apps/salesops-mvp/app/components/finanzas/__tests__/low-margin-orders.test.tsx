import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LowMarginOrders } from '../low-margin-orders';
import type { LowMarginOrdersView } from '../../../domain/finanzas-dashboard';

function buildView(rows: LowMarginOrdersView['rows']): LowMarginOrdersView {
  return { rows };
}

describe('LowMarginOrders', () => {
  it('renders rows in the given (ascending) order, Margen column via formatMoney', () => {
    const view = buildView([
      { orderId: 'a', clientName: 'Cliente A', revenueUSD: 100, marginUSD: 50 },
      { orderId: 'b', clientName: 'Cliente B', revenueUSD: 100, marginUSD: 100 },
      { orderId: 'c', clientName: 'Cliente C', revenueUSD: 100, marginUSD: 300 },
    ]);
    render(<LowMarginOrders lowMarginOrders={view} />);

    const bodyRows = screen.getAllByRole('row').slice(1); // skip header row
    const margins = bodyRows.map((tr) => tr.querySelectorAll('td')[2]?.textContent);
    expect(margins).toEqual(['$50.00', '$100.00', '$300.00']);
  });

  it('never shows "pérdida"/"loss" language even for a negative margin', () => {
    const view = buildView([{ orderId: 'a', clientName: 'Cliente A', revenueUSD: 100, marginUSD: -20 }]);
    const { container } = render(<LowMarginOrders lowMarginOrders={view} />);
    const text = container.textContent?.toLowerCase() ?? '';
    expect(text).not.toContain('pérdida');
    expect(text).not.toContain('loss');
  });

  it('heading "Pedidos de menor margen" has no "finanzas"', () => {
    const view = buildView([{ orderId: 'a', clientName: 'Cliente A', revenueUSD: 100, marginUSD: 50 }]);
    render(<LowMarginOrders lowMarginOrders={view} />);
    expect(screen.getByText('Pedidos de menor margen').textContent?.toLowerCase()).not.toContain('finanzas');
  });

  it('renders a help affordance', () => {
    const view = buildView([{ orderId: 'a', clientName: 'Cliente A', revenueUSD: 100, marginUSD: 50 }]);
    render(<LowMarginOrders lowMarginOrders={view} />);
    expect(screen.getByRole('button', { name: /qué significa/i })).toBeInTheDocument();
  });
});
