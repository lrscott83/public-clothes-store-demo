import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AreaTrend } from '../area-trend';

describe('AreaTrend', () => {
  it('renders a single <polyline> with exactly points.length coordinate pairs — no separate <path> area fill', () => {
    const points = [
      { label: 'Día 1', value: 10 },
      { label: 'Día 2', value: 50 },
      { label: 'Día 3', value: 20 },
      { label: 'Día 4', value: 80 },
    ];
    const { container } = render(<AreaTrend points={points} ariaLabel="Tendencia de ventas" />);

    const polylines = container.querySelectorAll('polyline');
    expect(polylines).toHaveLength(1);
    expect(container.querySelectorAll('path')).toHaveLength(0);

    const coords = polylines[0].getAttribute('points')!.trim().split(/\s+/);
    expect(coords).toHaveLength(points.length);
  });

  it('scales the first and last coordinate pairs to reflect min/max value positioning', () => {
    const points = [
      { label: 'Día 1', value: 0 },
      { label: 'Día 2', value: 100 },
    ];
    const { container } = render(<AreaTrend points={points} ariaLabel="Tendencia" />);

    const polyline = container.querySelector('polyline')!;
    const [first, last] = polyline.getAttribute('points')!.trim().split(/\s+/);
    const [, firstY] = first.split(',').map(Number);
    const [, lastY] = last.split(',').map(Number);

    // value 0 → bottom (larger y), value 100 → top (smaller y) in SVG coordinate space.
    expect(firstY).toBeGreaterThan(lastY);
  });

  it('renders no polyline and does not throw when points is empty', () => {
    const { container } = render(<AreaTrend points={[]} ariaLabel="Tendencia" />);

    expect(container.querySelectorAll('polyline')).toHaveLength(0);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
