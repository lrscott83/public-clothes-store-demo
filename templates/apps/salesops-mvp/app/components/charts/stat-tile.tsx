import type { ReactNode } from 'react';

/** Arrow direction, structurally identical to the domain `Trend` (kept local so this primitive imports nothing from `app/domain`). */
export type StatTileTrend = 'up' | 'down' | 'flat';

export interface StatTileProps {
  label: string;
  /** Already formatted (currency/MN/percent) — this component never formats numbers. */
  value: string;
  /**
   * Arrow direction. When provided it drives the arrow (and color); this is the
   * source of truth so an "up" trend still shows ▲ even when `delta` is `null`
   * (the prior window was 0, so a percentage change is undefined). When omitted,
   * direction falls back to the sign of `delta`.
   */
  trend?: StatTileTrend;
  /** Fractional change vs the prior period (e.g. `0.25` = +25%). `null`/`undefined` → no percentage text. */
  delta?: number | null;
  /** Whether a rising value is "good" (green) or "bad" (red). Defaults to `true`. */
  positiveIsGood?: boolean;
  /** Optional secondary line under the value (e.g. an AOV figure alongside a count). */
  sublabel?: string;
  /** Optional affordance rendered next to the label (e.g. an `InfoPopover` help icon). */
  help?: ReactNode;
}

/**
 * Generic KPI card — a single number with an optional trend arrow. Domain
 * agnostic: `value`/`sublabel` arrive pre-formatted from the section
 * component. `positiveIsGood` flips the color mapping so a KPI like
 * "Comisión pendiente" (where more owed is worse) still shows red when
 * rising, even though the arrow direction itself is unchanged.
 */
export function StatTile({ label, value, trend, delta, positiveIsGood = true, sublabel, help }: StatTileProps) {
  const hasDelta = delta !== null && delta !== undefined;
  // Arrow direction: prefer the explicit trend, else derive it from the delta sign.
  const direction: StatTileTrend = trend ?? (hasDelta ? (delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat') : 'flat');
  const isUp = direction === 'up';
  const isDown = direction === 'down';
  const showArrow = isUp || isDown;
  const isGoodDirection = isUp ? positiveIsGood : !positiveIsGood;
  const colorClass = !showArrow ? 'text-text-muted' : isGoodDirection ? 'text-success' : 'text-danger';

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-1">
        <p className="text-xs font-medium text-text-muted">{label}</p>
        {help}
      </div>
      <p className="mt-1 text-2xl font-bold text-text">{value}</p>
      <div className="mt-1 flex items-center gap-1 text-sm">
        {showArrow ? (
          <>
            <span className={colorClass}>{isUp ? '▲' : '▼'}</span>
            {hasDelta && <span className={colorClass}>{Math.abs(delta * 100).toFixed(1)}%</span>}
          </>
        ) : (
          <span className="text-text-muted">—</span>
        )}
        {sublabel && <span className="text-text-muted">{sublabel}</span>}
      </div>
    </div>
  );
}
