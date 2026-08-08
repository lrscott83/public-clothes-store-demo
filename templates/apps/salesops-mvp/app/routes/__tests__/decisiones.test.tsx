import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import Decisiones from '../decisiones';
import { loadSeedState, saveSeedState, verifyOrder } from '../../store/seed-store';

describe('Decisiones container', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders exactly one <h1>Decisiones</h1> and Capa 1 (3 cards)', () => {
    const state = loadSeedState();
    const creadoOrder = state.orders.find((o) => o.state === 'creado');
    if (creadoOrder) verifyOrder(creadoOrder.id);

    render(<Decisiones />);

    expect(screen.getByRole('heading', { level: 1, name: 'Decisiones' })).toBeInTheDocument();

    // Capa 1 — Pulso inmediato: 3 cards
    expect(screen.getByText('Pedidos activos por estado y almacén')).toBeInTheDocument();
    expect(screen.getByText('Transportistas')).toBeInTheDocument();
    expect(screen.getByText('Comisiones por pagar')).toBeInTheDocument();
  });

  it('renders Capa 2 — stock crítico and pedidos demorados', () => {
    loadSeedState();
    render(<Decisiones />);

    expect(screen.getByText('Alertas de inventario')).toBeInTheDocument();
    expect(screen.getByText('Pedidos demorados / trabados')).toBeInTheDocument();
  });

  it('renders Capa 3 — 4 blocks under a shared [7d/30d] filter', () => {
    const state = loadSeedState();
    const creadoOrder = state.orders.find((o) => o.state === 'creado');
    if (creadoOrder) verifyOrder(creadoOrder.id);

    render(<Decisiones />);

    expect(screen.getByText('Entra vs. sale')).toBeInTheDocument();
    expect(screen.getByText('Ciclo promedio')).toBeInTheDocument();
    expect(screen.getByText('Pedidos por día')).toBeInTheDocument();
    expect(screen.getByText('Completados por día')).toBeInTheDocument();
    expect(screen.getAllByRole('group', { name: 'Filtro de período' }).length).toBeGreaterThan(0);
  });

  it('renders the Análisis section with exactly 3 blocks: Ventas por almacén, Mix por moneda, Ranking de gestores', () => {
    const state = loadSeedState();
    const creadoOrder = state.orders.find((o) => o.state === 'creado');
    if (creadoOrder) verifyOrder(creadoOrder.id);

    render(<Decisiones />);

    expect(screen.getByText('Ventas por almacén')).toBeInTheDocument();
    expect(screen.getByText('Mix por moneda')).toBeInTheDocument();
    expect(screen.getByText('Ranking de gestores')).toBeInTheDocument();
  });

  it('renders no KPI header, sales-trend, stage-distribution, margin, or AOV block anywhere', () => {
    const state = loadSeedState();
    const creadoOrder = state.orders.find((o) => o.state === 'creado');
    if (creadoOrder) verifyOrder(creadoOrder.id);

    render(<Decisiones />);

    expect(screen.queryByText('Tendencia de ventas (20 días)')).not.toBeInTheDocument();
    expect(screen.queryByText('Pedidos por etapa')).not.toBeInTheDocument();
    expect(screen.queryByText('Margen')).not.toBeInTheDocument();
    expect(screen.queryByText('Top productos por margen')).not.toBeInTheDocument();
    expect(screen.queryByText('Pedidos de menor margen')).not.toBeInTheDocument();
    expect(screen.queryByText(/ticket promedio/i)).not.toBeInTheDocument();
  });

  it('renders a single unambiguous heading matching /decisiones/i; no subheading repeats it', () => {
    loadSeedState();
    render(<Decisiones />);

    const headings = screen.getAllByRole('heading');
    const matching = headings.filter((h) => /decisiones/i.test(h.textContent ?? ''));
    expect(matching).toHaveLength(1);
    expect(matching[0].tagName).toBe('H1');
  });

  it('toggling the [7d/30d] filter recomputes Capa 3 (and Análisis) without touching SeedState', () => {
    const state = loadSeedState();
    const creadoOrder = state.orders.find((o) => o.state === 'creado');
    if (creadoOrder) verifyOrder(creadoOrder.id);
    const storedBefore = localStorage.getItem('salesops-mvp:seed:v1');

    render(<Decisiones />);

    // Capa 3's filter and Análisis's filter share the same `windowDays`
    // state; Ranking de gestores carries its own independent [7d/30d/General]
    // selector (also rendered as a "Filtro de período" group) — the last of
    // the 3 groups in document order.
    const groups = screen.getAllByRole('group', { name: 'Filtro de período' });
    expect(groups).toHaveLength(3);
    const [capa3Filter, analisisFilter, gestorFilter] = groups;

    for (const group of [capa3Filter, analisisFilter]) {
      const sevenBtn = group.querySelector('button:first-child')!;
      expect(sevenBtn).toHaveAttribute('aria-pressed', 'true');
    }

    fireEvent.click(capa3Filter.querySelector('button:last-child')!); // 30d

    for (const group of [capa3Filter, analisisFilter]) {
      const thirtyBtn = group.querySelector('button:last-child')!;
      const sevenBtn = group.querySelector('button:first-child')!;
      expect(thirtyBtn).toHaveAttribute('aria-pressed', 'true');
      expect(sevenBtn).toHaveAttribute('aria-pressed', 'false');
    }

    // Ranking de gestores' own selector is independent — unaffected by the
    // Capa 3 / Análisis toggle, still showing its own default (7d).
    const gestorSevenBtn = gestorFilter.querySelector('button:first-child')!;
    expect(gestorSevenBtn).toHaveAttribute('aria-pressed', 'true');

    // SeedState itself is not re-read/mutated by the toggle.
    if (storedBefore !== null) {
      expect(localStorage.getItem('salesops-mvp:seed:v1')).toBe(storedBefore);
    }
  });

  it('renders no <form> element (read-only route)', () => {
    const state = loadSeedState();
    const creadoOrder = state.orders.find((o) => o.state === 'creado');
    if (creadoOrder) verifyOrder(creadoOrder.id);

    const { container } = render(<Decisiones />);

    expect(container.querySelector('form')).toBeNull();
  });

  it('shows an empty-state message on Capa 1.3, Capa 3, and Análisis when only creado orders exist; Capa 1.1/1.2/Capa 2 still render real data', () => {
    const state = loadSeedState();
    state.orders = state.orders.map((order) => ({ ...order, state: 'creado' as const }));
    saveSeedState(state);

    render(<Decisiones />);

    expect(screen.getByRole('heading', { level: 1, name: 'Decisiones' })).toBeInTheDocument();

    // Capa 1.1/1.2 and Capa 2 are exempt — they still render (no fabricated
    // data involved: 1.1 counts creado orders too; 1.2/Capa 2 derive from
    // transportistas/inventory, not from qualifying orders).
    expect(screen.getByText('Pedidos activos por estado y almacén')).toBeInTheDocument();
    expect(screen.getByText('Transportistas')).toBeInTheDocument();
    expect(screen.getByText('Alertas de inventario')).toBeInTheDocument();

    // Capa 1.3, Capa 3, and Análisis show an empty-state message instead of
    // fabricated zero-value figures.
    expect(screen.queryByText('Ranking de gestores')).not.toBeInTheDocument();
    expect(screen.queryByText('Entra vs. sale')).not.toBeInTheDocument();
    expect(screen.queryByText('Ciclo promedio')).not.toBeInTheDocument();
    expect(screen.getAllByText(/no hay pedidos/i).length).toBeGreaterThanOrEqual(3);
  });
});
