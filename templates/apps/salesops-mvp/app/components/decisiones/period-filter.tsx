import type { WindowDays } from '../../domain/decisiones-dashboard';

export interface PeriodFilterProps {
  value: WindowDays;
  onChange: (days: WindowDays) => void;
}

/**
 * Capa 3's shared `[7d/30d]` toggle. View-only local control — the
 * selected value is owned by the route (`useState<WindowDays>`); this leaf
 * never reads or mutates `SeedState` itself, it only reports the click.
 */
export function PeriodFilter({ value, onChange }: PeriodFilterProps) {
  return (
    <div className="flex gap-1 text-xs" role="group" aria-label="Filtro de período">
      <button
        type="button"
        aria-pressed={value === 7}
        onClick={() => onChange(7)}
        className={`rounded px-2 py-1 ${value === 7 ? 'bg-primary text-white' : 'text-text-muted'}`}
      >
        7d
      </button>
      <button
        type="button"
        aria-pressed={value === 30}
        onClick={() => onChange(30)}
        className={`rounded px-2 py-1 ${value === 30 ? 'bg-primary text-white' : 'text-text-muted'}`}
      >
        30d
      </button>
    </div>
  );
}
