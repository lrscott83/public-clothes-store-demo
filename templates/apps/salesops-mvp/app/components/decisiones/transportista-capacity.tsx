import { InfoPopover } from '../shared/info-popover';
import { DECISIONES_HELP } from './help-content';
import type { TransportistaCapacityView } from '../../domain/decisiones-dashboard';

export interface TransportistaCapacityProps {
  capacity: TransportistaCapacityView;
}

const STATUS_CLASSNAME: Record<'ocupado' | 'disponible', string> = {
  ocupado: 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700',
  disponible: 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700',
};

/**
 * Capa 1.2 — "Transportistas": totals for disponibles/en camino/sin chofer
 * up top, then one row per transportista with an Ocupado/Disponible pill.
 * "Sin chofer" counts `verificado` orders with no `transportistaId`, so it
 * is shown as its own figure — not derivable from the rows below.
 */
export function TransportistaCapacity({ capacity }: TransportistaCapacityProps) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5">
        <h2 className="text-lg font-semibold text-text">Transportistas</h2>
        <InfoPopover {...DECISIONES_HELP.transportistas} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span className="text-text">
          <strong>{capacity.disponibles}</strong> disponibles
        </span>
        <span className="text-text">
          <strong>{capacity.transportando}</strong> en camino
        </span>
        <span className="text-text">
          <strong>{capacity.sinChofer}</strong> sin chofer
        </span>
      </div>
      <ul className="mt-3 flex flex-col gap-1">
        {capacity.rows.map((row) => (
          <li key={row.transportistaId} className="flex items-center justify-between text-sm">
            <span className="text-text">{row.name}</span>
            <span className={STATUS_CLASSNAME[row.ocupado ? 'ocupado' : 'disponible']}>
              {row.ocupado ? 'Ocupado' : 'Disponible'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
