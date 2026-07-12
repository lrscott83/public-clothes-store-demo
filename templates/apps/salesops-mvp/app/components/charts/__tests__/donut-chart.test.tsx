import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DonutChart } from '../donut-chart';

describe('DonutChart', () => {
  it('renders exactly one <circle> per slice — no arc <path>', () => {
    const slices = [
      { label: 'USD', value: 40 },
      { label: 'MN', value: 30 },
      { label: 'ZELLE', value: 20 },
      { label: 'EUR', value: 10 },
    ];
    const { container } = render(<DonutChart slices={slices} ariaLabel="Mix por moneda" />);

    // one background ring circle + one arc circle per slice is acceptable,
    // but the slice arcs themselves must equal slices.length.
    const arcCircles = container.querySelectorAll('circle[data-slice]');
    expect(arcCircles).toHaveLength(4);
    expect(container.querySelectorAll('path')).toHaveLength(0);
  });

  it('renders legend labels and percent text that sums to 100', () => {
    const slices = [
      { label: 'USD', value: 40 },
      { label: 'MN', value: 30 },
      { label: 'ZELLE', value: 20 },
      { label: 'EUR', value: 10 },
    ];
    render(<DonutChart slices={slices} ariaLabel="Mix por moneda" />);

    expect(screen.getByText('USD')).toBeInTheDocument();
    expect(screen.getByText('MN')).toBeInTheDocument();
    expect(screen.getByText('ZELLE')).toBeInTheDocument();
    expect(screen.getByText('EUR')).toBeInTheDocument();

    const percentTexts = screen.getAllByText(/%$/);
    const total = percentTexts.reduce((sum, node) => sum + Number.parseFloat(node.textContent ?? '0'), 0);
    expect(total).toBeCloseTo(100, 5);
  });

  it('renders a full-ring circle with stroke-dasharray covering the full circumference for a single slice', () => {
    const { container } = render(<DonutChart slices={[{ label: 'USD', value: 100 }]} ariaLabel="Mix" />);

    const arc = container.querySelector('circle[data-slice]')!;
    const dasharray = arc.getAttribute('stroke-dasharray')!;
    const [dash, gap] = dasharray.split(/[\s,]+/).map(Number);
    const circumference = dash + gap;

    expect(dash).toBeCloseTo(circumference, 1);
  });

  it('renders no slice circles and does not throw when slices is empty', () => {
    const { container } = render(<DonutChart slices={[]} ariaLabel="Mix" />);

    expect(container.querySelectorAll('circle[data-slice]')).toHaveLength(0);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
