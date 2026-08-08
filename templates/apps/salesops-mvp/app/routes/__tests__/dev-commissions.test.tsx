import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import DevCommissions from '../dev-commissions';

describe('DevCommissions route', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders all 99 product rows from loadSeedState().products', () => {
    render(<DevCommissions />);

    const rows = screen.getAllByRole('row');
    // 1 header row + 99 data rows.
    expect(rows).toHaveLength(100);
  });

  it('shows the ⚠ marker on fallback (category-default/catch-all) rows', () => {
    render(<DevCommissions />);

    const warnings = screen.getAllByText('⚠', { exact: false });
    expect(warnings.length).toBeGreaterThan(0);
  });
});
