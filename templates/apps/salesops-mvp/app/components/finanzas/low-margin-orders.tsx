import { formatMoney } from '@store-mgmt/storefront/config';
import { InfoPopover } from '../shared/info-popover';
import { FINANZAS_HELP } from './help-content';
import type { LowMarginOrdersView } from '../../domain/finanzas-dashboard';

export interface LowMarginOrdersProps {
  lowMarginOrders: LowMarginOrdersView;
}

const MONEY = { locale: 'en-US', currency: 'USD' } as const;

/**
 * Layer 3 — "Pedidos de menor margen": renders the domain builder's rows in
 * the given (ascending) order, with NO "pérdida"/"loss" label or styling.
 * The framing here is strictly a lower-margin ranking, not a loss report.
 */
export function LowMarginOrders({ lowMarginOrders }: LowMarginOrdersProps) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5">
        <h2 className="text-lg font-semibold text-text">Pedidos de menor margen</h2>
        <InfoPopover {...FINANZAS_HELP.pedidosMenorMargen} />
      </div>
      <div className="mt-2 max-h-72 overflow-y-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-surface">
            <tr>
              <th className="px-2 py-1">Cliente</th>
              <th className="px-2 py-1">Ingresos</th>
              <th className="px-2 py-1">Margen</th>
            </tr>
          </thead>
          <tbody>
            {lowMarginOrders.rows.map((row) => (
              <tr key={row.orderId} className="border-t border-border">
                <td className="px-2 py-1">{row.clientName}</td>
                <td className="px-2 py-1">{formatMoney(row.revenueUSD, MONEY)}</td>
                <td className="px-2 py-1">{formatMoney(row.marginUSD, MONEY)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
