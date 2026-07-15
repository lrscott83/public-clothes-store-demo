import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ComisionesPorPagar } from '../comisiones-por-pagar';
import type { ComisionesPorPagarView } from '../../../domain/decisiones-dashboard';

const VIEW: ComisionesPorPagarView = {
  totalPendienteMN: 5000,
  rows: [
    { gestorId: 'g1', gestorName: 'Gestor Uno', diasAtraso: 9, comisionMN: 2000, totalPendienteMN: 3000 },
    { gestorId: 'g2', gestorName: 'Gestor Dos', diasAtraso: 3, comisionMN: 800, totalPendienteMN: 800 },
  ],
};

describe('ComisionesPorPagar', () => {
  it('renders the total pending figure', () => {
    render(<ComisionesPorPagar comisiones={VIEW} />);

    expect(screen.getByText(/5000|5,000/)).toBeInTheDocument();
  });

  it('renders one row per gestor with días de atraso and their overdue commission value', () => {
    render(<ComisionesPorPagar comisiones={VIEW} />);

    expect(screen.getByText('Gestor Uno')).toBeInTheDocument();
    expect(screen.getByText('Gestor Dos')).toBeInTheDocument();
    expect(screen.getByText(/9/)).toBeInTheDocument();
  });

  it('renders an empty state when there are no overdue rows', () => {
    render(<ComisionesPorPagar comisiones={{ totalPendienteMN: 0, rows: [] }} />);

    expect(screen.queryByText('Gestor Uno')).not.toBeInTheDocument();
  });

  it('has no "decisiones" in the heading', () => {
    render(<ComisionesPorPagar comisiones={VIEW} />);

    expect(screen.getByText('Comisiones por pagar').textContent?.toLowerCase()).not.toContain('decisiones');
  });
});
