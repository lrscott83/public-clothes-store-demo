import { formatMoney } from '@store-mgmt/storefront/config';
import { InfoPopover } from '../shared/info-popover';
import { FINANZAS_HELP } from './help-content';
import type { WarehouseRevenueView } from '../../domain/finanzas-dashboard';

export interface WarehouseRevenueProps {
  warehouseRevenue: WarehouseRevenueView;
}

const MONEY = { locale: 'en-US', currency: 'USD' } as const;

/**
 * Layer 3b — "Ventas por almacén": one row per warehouse (zero-order
 * warehouses still shown), the financial angle on warehouse sales — revenue
 * and order count per location.
 */
export function WarehouseRevenue({ warehouseRevenue }: WarehouseRevenueProps) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5">
        <h2 className="text-lg font-semibold text-text">Ventas por almacén</h2>
        <InfoPopover {...FINANZAS_HELP.ventasPorAlmacen} />
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="px-2 py-1">Almacén</th>
              <th className="px-2 py-1">Ventas</th>
              <th className="px-2 py-1">Pedidos</th>
            </tr>
          </thead>
          <tbody>
            {warehouseRevenue.rows.map((row) => (
              <tr key={row.warehouseId} className="border-t border-border">
                <td className="px-2 py-1">{row.warehouseName}</td>
                <td className="px-2 py-1">{formatMoney(row.revenueUSD, MONEY)}</td>
                <td className="px-2 py-1">{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
