import { InfoPopover } from '../shared/info-popover';
import { DECISIONES_HELP } from './help-content';
import type { CicloPromedioView } from '../../domain/decisiones-dashboard';

export interface CicloPromedioProps {
  ciclo: CicloPromedioView;
}

/**
 * Capa 3 — "Ciclo promedio (creado → entregado)": the current window's
 * average cycle time in days, with a trend arrow vs. the immediately
 * preceding window of equal length. A rising cycle time is "bad" (slower
 * deliveries), so the arrow color flips accordingly. `deltaDays` arrives
 * already safe (0/flat when the prior window has zero delivered orders) —
 * this leaf never divides or guards anything itself.
 */
export function CicloPromedio({ ciclo }: CicloPromedioProps) {
  const isUp = ciclo.deltaDays > 0;
  const isDown = ciclo.deltaDays < 0;
  const colorClass = !isUp && !isDown ? 'text-text-muted' : isUp ? 'text-danger' : 'text-success';

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5">
        <h2 className="text-lg font-semibold text-text">Ciclo promedio</h2>
        <InfoPopover {...DECISIONES_HELP.cicloPromedio} />
      </div>
      <p className="mt-2 text-2xl font-semibold text-text">{ciclo.currentAvgDays.toFixed(1)} días</p>
      <div className="mt-1 flex items-center gap-1 text-sm">
        {isUp || isDown ? (
          <>
            <span className={colorClass}>{isUp ? '▲' : '▼'}</span>
            <span className={colorClass}>{Math.abs(ciclo.deltaDays).toFixed(1)}d vs período anterior</span>
          </>
        ) : (
          <span className="text-text-muted">— sin cambio vs período anterior</span>
        )}
      </div>
    </div>
  );
}
