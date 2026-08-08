import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CommissionLiabilityDonut } from '../commission-liability-donut';
import type { CommissionLiabilityView } from '../../../domain/finanzas-dashboard';

describe('CommissionLiabilityDonut', () => {
  it('renders one donut with 2 slices (pagada vs pendiente) and their MN legend labels', () => {
    const view: CommissionLiabilityView = { paidMN: 6000, pendingMN: 3000 };

    const { container } = render(<CommissionLiabilityDonut commissionLiability={view} />);

    expect(container.querySelectorAll('svg[role="img"]')).toHaveLength(1);
    expect(container.querySelectorAll('circle[data-slice]')).toHaveLength(2);
    expect(screen.getByText('Pagada')).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
  });

  it('renders a help affordance and heading', () => {
    render(<CommissionLiabilityDonut commissionLiability={{ paidMN: 0, pendingMN: 0 }} />);

    expect(screen.getByText('Comisión pagada vs pendiente')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /qué significa/i })).toBeInTheDocument();
  });
});
