import { formatMoney } from '@store-mgmt/storefront/config';
import { InfoPopover } from '../shared/info-popover';
import { DECISIONES_HELP } from './help-content';
import type { GestorRankingView } from '../../domain/decisiones-dashboard';

export interface GestorRankingProps {
  gestores: GestorRankingView;
}

const MONEY = { locale: 'en-US', currency: 'USD' } as const;

/**
 * Layer 3a — "Ranking de gestores": one row per gestor (zero-order gestores
 * still shown), sorted desc by revenue by the domain builder. Revenue/AOV
 * are USD via `formatMoney`; commission figures stay native MN plain text.
 */
export function GestorRanking({ gestores }: GestorRankingProps) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5">
        <h2 className="text-lg font-semibold text-text">Ranking de gestores</h2>
        <InfoPopover {...DECISIONES_HELP.rankingGestores} />
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="px-2 py-1">Gestor</th>
              <th className="px-2 py-1">Ventas</th>
              <th className="px-2 py-1">Pedidos</th>
              <th className="px-2 py-1">AOV</th>
              <th className="px-2 py-1">Comisión devengada</th>
              <th className="px-2 py-1">Comisión pendiente</th>
            </tr>
          </thead>
          <tbody>
            {gestores.rows.map((row) => (
              <tr key={row.gestorId} className="border-t border-border">
                <td className="px-2 py-1">{row.name}</td>
                <td className="px-2 py-1">{formatMoney(row.revenueUSD, MONEY)}</td>
                <td className="px-2 py-1">{row.count}</td>
                <td className="px-2 py-1">{formatMoney(row.aovUSD, MONEY)}</td>
                <td className="px-2 py-1">{row.commissionEarnedMN} MN</td>
                <td className="px-2 py-1">{row.commissionPendingMN} MN</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
