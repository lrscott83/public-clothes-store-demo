import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CicloPromedio } from '../ciclo-promedio';
import type { CicloPromedioView } from '../../../domain/decisiones-dashboard';

describe('CicloPromedio', () => {
  it('renders the current average cycle in days', () => {
    const view: CicloPromedioView = { windowDays: 7, currentAvgDays: 4, priorAvgDays: 6, deltaDays: -2, count: 2 };
    render(<CicloPromedio ciclo={view} />);

    expect(screen.getByText(/4/)).toBeInTheDocument();
  });

  it('shows a down trend when the cycle got shorter (deltaDays negative)', () => {
    const view: CicloPromedioView = { windowDays: 7, currentAvgDays: 4, priorAvgDays: 6, deltaDays: -2, count: 2 };
    const { container } = render(<CicloPromedio ciclo={view} />);

    expect(container.textContent).toContain('2');
    expect(screen.getByText('▼')).toBeInTheDocument();
  });

  it('shows a flat indicator when deltaDays is 0 (e.g. zero prior-window orders)', () => {
    const view: CicloPromedioView = { windowDays: 7, currentAvgDays: 4, priorAvgDays: 0, deltaDays: 0, count: 1 };
    render(<CicloPromedio ciclo={view} />);

    expect(screen.queryByText('▲')).not.toBeInTheDocument();
    expect(screen.queryByText('▼')).not.toBeInTheDocument();
  });

  it('has no "decisiones" in the heading', () => {
    const view: CicloPromedioView = { windowDays: 7, currentAvgDays: 4, priorAvgDays: 6, deltaDays: -2, count: 2 };
    render(<CicloPromedio ciclo={view} />);

    expect(screen.getByText('Ciclo promedio').textContent?.toLowerCase()).not.toContain('decisiones');
  });
});
