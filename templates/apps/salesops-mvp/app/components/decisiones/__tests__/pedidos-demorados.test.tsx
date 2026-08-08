import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PedidosDemorados } from '../pedidos-demorados';
import type { PedidosDemoradosView } from '../../../domain/decisiones-dashboard';

const VIEW: PedidosDemoradosView = {
  rows: [
    { orderId: 'o1', clientName: 'Cliente Uno', stage: 'verificado', label: 'Verificado', diasEnEtapa: 4, thresholdDays: 3 },
    { orderId: 'o2', clientName: 'Cliente Dos', stage: 'creado', label: 'Creado', diasEnEtapa: 2, thresholdDays: 2 },
  ],
};

describe('PedidosDemorados', () => {
  it('renders one row per demorado order with client name, stage label, and age', () => {
    render(<PedidosDemorados demorados={VIEW} />);

    expect(screen.getByText('Cliente Uno')).toBeInTheDocument();
    expect(screen.getByText('Cliente Dos')).toBeInTheDocument();
    expect(screen.getByText(/Verificado/)).toBeInTheDocument();
    expect(screen.getByText(/4/)).toBeInTheDocument();
  });

  it('renders an empty state when there are no demorado rows', () => {
    render(<PedidosDemorados demorados={{ rows: [] }} />);

    expect(screen.queryByText('Cliente Uno')).not.toBeInTheDocument();
  });

  it('has no "decisiones" in the heading', () => {
    render(<PedidosDemorados demorados={VIEW} />);

    expect(screen.getByText('Pedidos demorados / trabados').textContent?.toLowerCase()).not.toContain('decisiones');
  });
});
