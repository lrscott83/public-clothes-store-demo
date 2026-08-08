import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BarChart } from '../bar-chart';

describe('BarChart', () => {
  it('renders exactly one <rect> per bar and each bar label via getByText', () => {
    const bars = [
      { label: 'Almacén A', value: 500 },
      { label: 'Almacén B', value: 300 },
      { label: 'Almacén C', value: 0 },
    ];
    const { container } = render(<BarChart bars={bars} ariaLabel="Ventas por almacén" />);

    expect(container.querySelectorAll('rect')).toHaveLength(3);
    expect(screen.getByText('Almacén A')).toBeInTheDocument();
    expect(screen.getByText('Almacén B')).toBeInTheDocument();
    expect(screen.getByText('Almacén C')).toBeInTheDocument();
  });

  it('renders formatted values via the formatValue prop', () => {
    const bars = [{ label: 'Almacén A', value: 500 }];
    render(<BarChart bars={bars} ariaLabel="Ventas" formatValue={(n) => `$${n.toFixed(2)}`} />);

    expect(screen.getByText('$500.00')).toBeInTheDocument();
  });

  it('renders the svg shell with zero rects and does not throw when bars is empty', () => {
    const { container } = render(<BarChart bars={[]} ariaLabel="Ventas" />);

    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.querySelectorAll('rect')).toHaveLength(0);
  });

  it('sets role=img and aria-label on the svg element', () => {
    const { container } = render(<BarChart bars={[{ label: 'A', value: 10 }]} ariaLabel="Ventas por almacén" />);

    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('role', 'img');
    expect(svg).toHaveAttribute('aria-label', 'Ventas por almacén');
  });
});
