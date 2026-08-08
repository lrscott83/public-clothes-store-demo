import { resolveChartColor } from './palette';

export interface DonutChartSlice {
  label: string;
  value: number;
  /** Optional explicit palette key (see `palette.ts`); otherwise colors cycle by index. */
  colorKey?: string;
}

export interface DonutChartProps {
  slices: DonutChartSlice[];
  ariaLabel: string;
}

const SIZE = 160;
const RADIUS = 60;
const STROKE_WIDTH = 20;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const CENTER = SIZE / 2;

/**
 * Generic donut chart — LOCKED to one `<circle>` per slice using
 * `stroke-dasharray`/`stroke-dashoffset` (no arc `<path d>` math), per the
 * design's strict-TDD render-test strategy. Each slice circle carries
 * `data-slice` so tests can distinguish it from the background ring. A
 * legend list surfaces `label` + computed percent as real `<text>`/DOM
 * nodes (screen-readable and test-assertable). Self-guards an empty
 * `slices` array — svg shell renders, no slice circles, no throw.
 */
export function DonutChart({ slices, ariaLabel }: DonutChartProps) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  let cumulativeOffset = 0;

  return (
    <div>
      <svg role="img" aria-label={ariaLabel} viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-auto w-full">
        <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" strokeWidth={STROKE_WIDTH} className="stroke-border" />
        {slices.map((slice, index) => {
          const color = resolveChartColor(index, slice.colorKey);
          const percent = total > 0 ? (slice.value / total) * 100 : 0;
          const dash = (percent / 100) * CIRCUMFERENCE;
          const gap = CIRCUMFERENCE - dash;
          const offset = -cumulativeOffset;
          cumulativeOffset += dash;

          return (
            <circle
              key={`${slice.label}-${index}`}
              data-slice={slice.label}
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              strokeWidth={STROKE_WIDTH}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${CENTER} ${CENTER})`}
              className={color.stroke}
            />
          );
        })}
      </svg>
      <ul className="mt-2 space-y-1 text-xs">
        {slices.map((slice, index) => {
          const color = resolveChartColor(index, slice.colorKey);
          const percent = total > 0 ? (slice.value / total) * 100 : 0;
          return (
            <li key={`${slice.label}-${index}`} className="flex items-center gap-2">
              <span className={`inline-block h-2 w-2 rounded-full ${color.fill}`} />
              <span className="text-text">{slice.label}</span>
              <span className="text-text-muted">{percent.toFixed(1)}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
