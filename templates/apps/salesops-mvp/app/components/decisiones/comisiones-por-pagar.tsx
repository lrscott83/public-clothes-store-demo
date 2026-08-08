import { InfoPopover } from '../shared/info-popover';
import { DECISIONES_HELP } from './help-content';
import type { ComisionesPorPagarView } from '../../domain/decisiones-dashboard';

export interface ComisionesPorPagarProps {
  comisiones: ComisionesPorPagarView;
}

/**
 * Capa 1.3 — "Comisiones por pagar": the total pending MN figure up top,
 * then a "más atrasadas" list with at most one row per gestor (their
 * most-overdue unpaid `entregado` order). MN values render as plain text,
 * never `formatMoney` (matches the KPI header convention — MN is not a
 * `formatMoney`-supported currency). A gestor with no overdue rows never
 * appears; the domain builder already filters that.
 */
export function ComisionesPorPagar({ comisiones }: ComisionesPorPagarProps) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5">
        <h2 className="text-lg font-semibold text-text">Comisiones por pagar</h2>
        <InfoPopover {...DECISIONES_HELP.comisionesPorPagar} />
      </div>
      <p className="mt-2 text-2xl font-semibold text-text">{comisiones.totalPendienteMN} MN</p>
      <p className="text-xs text-text-muted">total pendiente</p>
      {comisiones.rows.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1">
          {comisiones.rows.map((row) => (
            <li key={row.gestorId} className="flex items-center justify-between text-sm">
              <span className="text-text">{row.gestorName}</span>
              <span className="flex items-center gap-2 text-text-muted">
                <span>{row.diasAtraso}d de atraso</span>
                <span className="font-medium text-text">{row.comisionMN} MN</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-text-muted">Sin comisiones atrasadas.</p>
      )}
    </div>
  );
}
