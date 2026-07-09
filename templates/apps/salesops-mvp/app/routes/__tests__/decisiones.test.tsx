import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import Decisiones from '../decisiones';
import { loadSeedState, saveSeedState, verifyOrder } from '../../store/seed-store';

describe('Decisiones container', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders exactly one <h1>Decisiones</h1>, a ranked table, and a grand-totals card', () => {
    const state = loadSeedState();
    const creadoOrder = state.orders.find((o) => o.state === 'creado');
    if (creadoOrder) verifyOrder(creadoOrder.id);

    render(<Decisiones />);

    expect(screen.getByRole('heading', { level: 1, name: 'Decisiones' })).toBeInTheDocument();
    expect(screen.getByText('Resumen de rentabilidad')).toBeInTheDocument();
    expect(screen.getByText('Ranking de rentabilidad de pedidos')).toBeInTheDocument();
  });

  it('renders no mutation affordance (no form, no mutating button/control)', () => {
    loadSeedState();
    const { container } = render(<Decisiones />);

    expect(container.querySelector('form')).toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('renders a single unambiguous heading matching /decisiones/i', () => {
    loadSeedState();
    render(<Decisiones />);

    const headings = screen.getAllByRole('heading');
    const matching = headings.filter((h) => /decisiones/i.test(h.textContent ?? ''));
    expect(matching).toHaveLength(1);
    expect(matching[0].tagName).toBe('H1');
  });

  it('shows an empty-state message and no ranking table when only creado orders exist', () => {
    const state = loadSeedState();
    state.orders = state.orders.map((order) => ({ ...order, state: 'creado' as const }));
    saveSeedState(state);

    render(<Decisiones />);

    expect(screen.getByRole('heading', { level: 1, name: 'Decisiones' })).toBeInTheDocument();
    expect(screen.queryByText('Resumen de rentabilidad')).not.toBeInTheDocument();
    expect(screen.queryByText('Ranking de rentabilidad de pedidos')).not.toBeInTheDocument();
    expect(screen.getByText(/no hay pedidos/i)).toBeInTheDocument();
  });
});
