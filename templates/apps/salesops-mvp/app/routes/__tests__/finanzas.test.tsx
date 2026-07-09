import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import Finanzas from '../finanzas';
import { loadSeedState, saveSeedState } from '../../store/seed-store';

describe('Finanzas container', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders exactly one <h1>Finanzas</h1>, a KPI block, and a per-state breakdown table', () => {
    loadSeedState();

    render(<Finanzas />);

    expect(screen.getByRole('heading', { level: 1, name: 'Finanzas' })).toBeInTheDocument();
    expect(screen.getByText('Resumen de comisiones')).toBeInTheDocument();
    expect(screen.getByText('Flujo por estado')).toBeInTheDocument();
  });

  it('renders a single unambiguous heading matching /finanzas/i, with the descriptor as a <p>, not a heading', () => {
    loadSeedState();
    render(<Finanzas />);

    const headings = screen.getAllByRole('heading');
    const matching = headings.filter((h) => /finanzas/i.test(h.textContent ?? ''));
    expect(matching).toHaveLength(1);
    expect(matching[0].tagName).toBe('H1');

    for (const heading of headings) {
      expect(heading.textContent?.toLowerCase()).not.toContain('comisiones y flujo de caja');
    }
    expect(screen.getByText('Comisiones y flujo de caja').tagName).toBe('P');
    expect(
      screen.queryByRole('heading', { name: /comisiones y flujo de caja/i }),
    ).not.toBeInTheDocument();
  });

  it('renders no mutation affordance (no form, no button, no "marcar comisión pagada")', () => {
    loadSeedState();
    const { container } = render(<Finanzas />);

    expect(container.querySelector('form')).toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByText(/marcar comisi[oó]n pagada/i)).not.toBeInTheDocument();
  });

  it('with zero orders, still renders the single heading, all-zero KPIs, and all 5 states with count 0', () => {
    const state = loadSeedState();
    state.orders = [];
    saveSeedState(state);

    render(<Finanzas />);

    expect(screen.getByRole('heading', { level: 1, name: 'Finanzas' })).toBeInTheDocument();

    const table = screen.getByRole('table');
    const bodyRows = table.querySelectorAll('tbody tr');
    expect(bodyRows).toHaveLength(5);
    for (const row of Array.from(bodyRows)) {
      const pedidosCell = row.querySelectorAll('td')[1];
      expect(pedidosCell.textContent).toBe('0');
    }
  });
});
