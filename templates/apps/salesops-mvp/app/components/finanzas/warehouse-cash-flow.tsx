import { formatMoney } from '@store-mgmt/storefront/config';
import { InfoPopover } from '../shared/info-popover';
import { FINANZAS_HELP } from './help-content';
import type { WarehouseCashFlowView } from '../../domain/finanzas-dashboard';

export interface WarehouseCashFlowProps {
  warehouseCashFlow: WarehouseCashFlowView;
}

const MONEY = { locale: 'en-US', currency: 'USD' } as const;

/**
 * Layer 3b — "Cobros pendientes por almacén": one row per warehouse
 * (zero-order warehouses still shown), the financial angle on warehouse
 * sales — uncollected cash trapped per location (cobrado/pendiente USD),
 * not sales volume. A table (not a bar chart) because each warehouse needs
 * two figures side by side.
 */
export function WarehouseCashFlow({ warehouseCashFlow }: WarehouseCashFlowProps) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5">
        <h2 className="text-lg font-semibold text-text">Cobros pendientes por almacén</h2>
        <InfoPopover {...FINANZAS_HELP.cobrosPendientesAlmacen} />
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="px-2 py-1">Almacén</th>
              <th className="px-2 py-1">Cobrado</th>
              <th className="px-2 py-1">Pendiente</th>
            </tr>
          </thead>
          <tbody>
            {warehouseCashFlow.rows.map((row) => (
              <tr key={row.warehouseId} className="border-t border-border">
                <td className="px-2 py-1">{row.warehouseName}</td>
                <td className="px-2 py-1">{formatMoney(row.cobradoUSD, MONEY)}</td>
                <td className="px-2 py-1">{formatMoney(row.pendienteUSD, MONEY)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
