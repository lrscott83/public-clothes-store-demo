import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StageDistribution } from '../stage-distribution';
import type { StageDistributionView } from '../../../domain/decisiones-dashboard';

const STAGES: StageDistributionView = {
  rows: [
    { state: 'creado', label: 'Creado', count: 1 },
    { state: 'verificado', label: 'Verificado', count: 0 },
    { state: 'transportando', label: 'Transportando', count: 0 },
    { state: 'entregado', label: 'Entregado', count: 2 },
    { state: 'comision_pagada', label: 'Comisión pagada', count: 0 },
  ],
};

describe('StageDistribution', () => {
  it('renders 5 bars via BarChart, one per state, zero-count states included', () => {
    const { container } = render(<StageDistribution stages={STAGES} />);
    expect(container.querySelectorAll('rect')).toHaveLength(5);
    expect(screen.getByText('Creado')).toBeInTheDocument();
    expect(screen.getByText('Verificado')).toBeInTheDocument();
  });

  it('has no "decisiones" and no funnel/conversion language', () => {
    const { container } = render(<StageDistribution stages={STAGES} />);
    const text = container.textContent?.toLowerCase() ?? '';
    expect(text).not.toContain('decisiones');
    expect(text).not.toContain('% de conversión');
    expect(text).not.toContain('tasa de abandono');
  });
});
