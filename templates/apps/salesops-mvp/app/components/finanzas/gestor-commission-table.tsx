import { formatMoney } from '@store-mgmt/storefront/config';
import { InfoPopover } from '../shared/info-popover';
import { FINANZAS_HELP } from './help-content';
import type { GestorCommissionCostView } from '../../domain/finanzas-dashboard';

export interface GestorCommissionTableProps {
  gestorCommission: GestorCommissionCostView;
}

const MONEY = { locale: 'en-US', currency: 'USD' } as const;

/**
 * Layer 3a — "Comisión y ROI por gestor": one row per gestor (zero-order
 * gestores still shown), the financial angle on gestor ranking — commission
 * COST, take-rate, and ROI, rather than sales performance. Revenue is USD
 * via `formatMoney`; commission figures stay native MN plain text.
 */
export function GestorCommissionTable({ gestorCommission }: GestorCommissionTableProps) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5">
        <h2 className="text-lg font-semibold text-text">Comisión y ROI por gestor</h2>
        <InfoPopover {...FINANZAS_HELP.comisionRoiGestor} />
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="px-2 py-1">Gestor</th>
              <th className="px-2 py-1">Ingreso</th>
              <th className="px-2 py-1">Comisión pagada</th>
              <th className="px-2 py-1">Comisión pendiente</th>
              <th className="px-2 py-1">Take-rate</th>
              <th className="px-2 py-1">ROI</th>
            </tr>
          </thead>
          <tbody>
            {gestorCommission.rows.map((row) => (
              <tr key={row.gestorId} className="border-t border-border">
                <td className="px-2 py-1">{row.name}</td>
                <td className="px-2 py-1">{formatMoney(row.revenueUSD, MONEY)}</td>
                <td className="px-2 py-1">{row.commissionPaidMN} MN</td>
                <td className="px-2 py-1">{row.commissionPendingMN} MN</td>
                <td className="px-2 py-1">{row.takeRatePercent.toFixed(1)}%</td>
                <td className="px-2 py-1">{row.roi.toFixed(1)}x</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
