export interface AreaTrendPoint {
  label: string;
  value: number;
}

export interface AreaTrendProps {
  points: AreaTrendPoint[];
  ariaLabel: string;
  /** Formats each point's value for the optional axis tick labels. Defaults to `String(n)`. */
  formatValue?: (value: number) => string;
}

const WIDTH = 400;
const HEIGHT = 160;
const PADDING = 8;

/**
 * Generic trend line — LOCKED to a single `<polyline points="x1,y1 x2,y2 ...">`
 * coordinate mechanism (no separate `<path d>` area fill), per the design's
 * strict-TDD render-test strategy: `points` splits deterministically into
 * exactly `points.length` coordinate pairs, directly assertable under jsdom.
 * Self-guards an empty series — renders the svg shell, no polyline, no throw.
 */
export function AreaTrend({ points, ariaLabel, formatValue = String }: AreaTrendProps) {
  const usableWidth = WIDTH - PADDING * 2;
  const usableHeight = HEIGHT - PADDING * 2;
  const values = points.map((point) => point.value);
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const range = max - min || 1;

  const coords = points.map((point, index) => {
    const x = points.length > 1 ? PADDING + (index / (points.length - 1)) * usableWidth : PADDING + usableWidth / 2;
    const y = PADDING + usableHeight - ((point.value - min) / range) * usableHeight;
    return `${x},${y}`;
  });

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width="100%"
      height="auto"
      className="overflow-visible"
    >
      {coords.length > 0 && (
        <polyline points={coords.join(' ')} fill="none" className="stroke-primary" strokeWidth={2} />
      )}
      {points.length > 0 && (
        <>
          <text x={PADDING} y={HEIGHT - 2} className="fill-text-muted text-[9px]">
            {points[0].label} · {formatValue(points[0].value)}
          </text>
          <text x={WIDTH - PADDING} y={HEIGHT - 2} textAnchor="end" className="fill-text-muted text-[9px]">
            {points[points.length - 1].label} · {formatValue(points[points.length - 1].value)}
          </text>
        </>
      )}
    </svg>
  );
}
