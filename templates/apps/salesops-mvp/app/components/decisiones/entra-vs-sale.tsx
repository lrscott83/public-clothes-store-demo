import { InfoPopover } from '../shared/info-popover';
import { DECISIONES_HELP } from './help-content';
import type { EntraVsSaleView } from '../../domain/decisiones-dashboard';

export interface EntraVsSaleProps {
  entraVsSale: EntraVsSaleView;
}

/**
 * Capa 3 — "Entra vs. sale": creados vs. entregados within the selected
 * `[7d/30d]` window, side by side. Surfaces a backlog signal when creados
 * exceeds entregados (más entra de lo que sale).
 */
export function EntraVsSale({ entraVsSale }: EntraVsSaleProps) {
  const hasBacklog = entraVsSale.backlogDelta > 0;

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5">
        <h2 className="text-lg font-semibold text-text">Entra vs. sale</h2>
        <InfoPopover {...DECISIONES_HELP.entraVsSale} />
      </div>
      <div className="mt-2 flex items-center gap-6">
        <div>
          <p className="text-2xl font-semibold text-text">{entraVsSale.creados}</p>
          <p className="text-xs text-text-muted">entran (creados)</p>
        </div>
        <div>
          <p className="text-2xl font-semibold text-text">{entraVsSale.entregados}</p>
          <p className="text-xs text-text-muted">salen (entregados)</p>
        </div>
      </div>
      {hasBacklog && (
        <p className="mt-2 text-sm font-medium text-danger">
          ▲ Más entra de lo que sale ({entraVsSale.backlogDelta})
        </p>
      )}
    </div>
  );
}
