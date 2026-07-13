import { resolveChartColor } from './palette';

export interface BarChartBar {
  label: string;
  value: number;
  /** Optional explicit palette key (see `palette.ts`); otherwise colors cycle by index. */
  colorKey?: string;
}

export interface BarChartProps {
  bars: BarChartBar[];
  orientation?: 'horizontal' | 'vertical';
  /** Formats each bar's numeric value for the on-chart value label. Defaults to `String(n)`. */
  formatValue?: (value: number) => string;
  ariaLabel: string;
}

const WIDTH = 320;
const HEIGHT = 200;
const PADDING = 8;
const BAR_GAP = 6;
/** Horizontal orientation reserves this much track for the category label on the
 *  left and the value label on the right, so neither clips at the svg edge. */
const LABEL_LEFT = 90;
const VALUE_LABEL_W = 54;

/**
 * Generic bar chart — one `<rect>` + one label `<text>` (+ optional value
 * `<text>`) per bar. Bar length is proportional to `value / max(values)`.
 * Domain agnostic: takes plain `{ label, value }[]`, no formatting beyond the
 * injected `formatValue`. Self-guards an empty `bars` array — renders the
 * svg shell with zero rects, never throws (division-by-zero on `max` guarded).
 */
export function BarChart({ bars, orientation = 'horizontal', formatValue = String, ariaLabel }: BarChartProps) {
  const max = Math.max(1, ...bars.map((bar) => bar.value));
  const usableWidth = WIDTH - PADDING * 2;
  const usableHeight = HEIGHT - PADDING * 2;
  const slot = bars.length > 0 ? (orientation === 'horizontal' ? usableHeight : usableWidth) / bars.length : 0;
  const thickness = Math.max(0, slot - BAR_GAP);

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width="100%"
      height="auto"
      className="overflow-visible"
    >
      {bars.map((bar, index) => {
        const color = resolveChartColor(index, bar.colorKey);
        const ratio = max > 0 ? bar.value / max : 0;

        if (orientation === 'horizontal') {
          const barLength = ratio * (usableWidth - LABEL_LEFT - VALUE_LABEL_W);
          const y = PADDING + index * slot;
          return (
            <g key={`${bar.label}-${index}`}>
              <text x={0} y={y + thickness / 2} dy="0.32em" className="fill-text text-[9px]">
                {bar.label}
              </text>
              <rect x={LABEL_LEFT} y={y} width={Math.max(0, barLength)} height={thickness} className={color.fill} />
              <text x={LABEL_LEFT + 4 + barLength} y={y + thickness / 2} dy="0.32em" className="fill-text text-[9px]">
                {formatValue(bar.value)}
              </text>
            </g>
          );
        }

        const barHeight = ratio * (usableHeight - 30);
        const x = PADDING + index * slot;
        const y = PADDING + (usableHeight - 30) - barHeight;
        return (
          <g key={`${bar.label}-${index}`}>
            <rect x={x} y={y} width={thickness} height={Math.max(0, barHeight)} className={color.fill} />
            <text x={x + thickness / 2} y={usableHeight - 14} textAnchor="middle" className="fill-text text-[9px]">
              {bar.label}
            </text>
            <text x={x + thickness / 2} y={y - 4} textAnchor="middle" className="fill-text text-[9px]">
              {formatValue(bar.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
