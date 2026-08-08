import { InfoPopover } from '../shared/info-popover';
import { DECISIONES_HELP } from './help-content';
import type { PedidosDemoradosView } from '../../domain/decisiones-dashboard';

export interface PedidosDemoradosProps {
  demorados: PedidosDemoradosView;
}

/**
 * Capa 2 — "Pedidos demorados/trabados": one row per order stuck past its
 * stage's configured threshold (`STAGE_DELAY_THRESHOLD_DAYS`), most-stuck
 * first — the domain builder already sorts desc by `diasEnEtapa`. Rows are
 * plain — no chasing color-coding beyond the stage label + day count, since
 * every row here already cleared the "worth attention" bar.
 */
export function PedidosDemorados({ demorados }: PedidosDemoradosProps) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5">
        <h2 className="text-lg font-semibold text-text">Pedidos demorados / trabados</h2>
        <InfoPopover {...DECISIONES_HELP.pedidosDemorados} />
      </div>
      {demorados.rows.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1">
          {demorados.rows.map((row) => (
            <li key={row.orderId} className="flex items-center justify-between text-sm">
              <span className="text-text">{row.clientName}</span>
              <span className="text-text-muted">
                {row.label} hace {row.diasEnEtapa}d
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-text-muted">Sin pedidos demorados.</p>
      )}
    </div>
  );
}
