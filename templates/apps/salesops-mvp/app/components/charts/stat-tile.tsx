export interface StatTileProps {
  label: string;
  /** Already formatted (currency/MN/percent) — this component never formats numbers. */
  value: string;
  /** Fractional change vs the prior period (e.g. `0.25` = +25%). `null`/`undefined` → no arrow, neutral "—". */
  delta?: number | null;
  /** Whether a rising value is "good" (green) or "bad" (red). Defaults to `true`. */
  positiveIsGood?: boolean;
  /** Optional secondary line under the value (e.g. an AOV figure alongside a count). */
  sublabel?: string;
}

/**
 * Generic KPI card — a single number with an optional trend arrow. Domain
 * agnostic: `value`/`sublabel` arrive pre-formatted from the section
 * component. `positiveIsGood` flips the color mapping so a KPI like
 * "Comisión pendiente" (where more owed is worse) still shows red when
 * rising, even though the arrow direction itself is unchanged.
 */
export function StatTile({ label, value, delta, positiveIsGood = true, sublabel }: StatTileProps) {
  const hasDelta = delta !== null && delta !== undefined;
  const isUp = hasDelta && delta > 0;
  const isDown = hasDelta && delta < 0;
  const isGoodDirection = isUp ? positiveIsGood : isDown ? !positiveIsGood : true;
  const colorClass = !hasDelta || delta === 0 ? 'text-text-muted' : isGoodDirection ? 'text-success' : 'text-danger';

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs font-medium text-text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-text">{value}</p>
      <div className="mt-1 flex items-center gap-1 text-sm">
        {hasDelta ? (
          <>
            <span className={colorClass}>{isUp ? '▲' : isDown ? '▼' : '—'}</span>
            <span className={colorClass}>{Math.abs(delta * 100).toFixed(1)}%</span>
          </>
        ) : (
          <span className="text-text-muted">—</span>
        )}
        {sublabel && <span className="text-text-muted">{sublabel}</span>}
      </div>
    </div>
  );
}
