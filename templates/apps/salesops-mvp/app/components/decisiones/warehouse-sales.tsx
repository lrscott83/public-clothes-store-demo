import { formatMoney } from '@store-mgmt/storefront/config';
import { BarChart } from '../charts/bar-chart';
import { InfoPopover } from '../shared/info-popover';
import { DECISIONES_HELP } from './help-content';
import type { WarehouseSalesView } from '../../domain/decisiones-dashboard';

export interface WarehouseSalesProps {
  warehouses: WarehouseSalesView;
}

const MONEY = { locale: 'en-US', currency: 'USD' } as const;

/**
 * Layer 2c — "Ventas por almacén": one horizontal bar per warehouse,
 * revenue formatted via `formatMoney`. Zero-sale warehouses still appear
 * (the domain builder never omits them).
 */
export function WarehouseSales({ warehouses }: WarehouseSalesProps) {
  const bars = warehouses.rows.map((row) => ({ label: row.warehouseName, value: row.revenueUSD }));

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5">
        <h2 className="text-lg font-semibold text-text">Ventas por almacén</h2>
        <InfoPopover {...DECISIONES_HELP.ventasPorAlmacen} />
      </div>
      <div className="mt-2">
        <BarChart
          bars={bars}
          orientation="horizontal"
          ariaLabel="Ventas por almacén"
          formatValue={(value) => formatMoney(value, MONEY)}
        />
      </div>
    </div>
  );
}
