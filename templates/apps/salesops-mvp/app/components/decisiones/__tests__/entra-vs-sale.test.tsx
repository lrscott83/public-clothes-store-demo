import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EntraVsSale } from '../entra-vs-sale';
import type { EntraVsSaleView } from '../../../domain/decisiones-dashboard';

describe('EntraVsSale', () => {
  it('renders creados and entregados counts', () => {
    const view: EntraVsSaleView = { windowDays: 7, creados: 5, entregados: 3, backlogDelta: 2 };
    render(<EntraVsSale entraVsSale={view} />);

    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows a backlog signal when creados exceeds entregados', () => {
    const view: EntraVsSaleView = { windowDays: 7, creados: 5, entregados: 3, backlogDelta: 2 };
    render(<EntraVsSale entraVsSale={view} />);

    expect(screen.getByText(/más entra de lo que sale/i)).toBeInTheDocument();
  });

  it('does not show a backlog signal when entregados matches or exceeds creados', () => {
    const view: EntraVsSaleView = { windowDays: 7, creados: 3, entregados: 3, backlogDelta: 0 };
    render(<EntraVsSale entraVsSale={view} />);

    expect(screen.queryByText(/más entra de lo que sale/i)).not.toBeInTheDocument();
  });

  it('has no "decisiones" in the heading', () => {
    const view: EntraVsSaleView = { windowDays: 7, creados: 5, entregados: 3, backlogDelta: 2 };
    render(<EntraVsSale entraVsSale={view} />);

    expect(screen.getByText('Entra vs. sale').textContent?.toLowerCase()).not.toContain('decisiones');
  });
});
