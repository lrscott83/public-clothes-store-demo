import { formatMoney } from '@store-mgmt/storefront/config';
import { StatTile } from '../charts/stat-tile';
import { InfoPopover } from '../shared/info-popover';
import { FINANZAS_HELP } from './help-content';
import type { FinanceKpiHeaderView } from '../../domain/finanzas-dashboard';

export interface FinanceKpiHeaderProps {
  kpis: FinanceKpiHeaderView;
}

const MONEY = { locale: 'en-US', currency: 'USD' } as const;

/**
 * Layer 1 — exactly 5 `StatTile`s in the fixed order: Ingresos facturados
 * (USD), Ingresos liquidados (MN plain text, never `formatMoney`), Comisión
 * pendiente (MN), Margen neto (USD + % sublabel), Ticket promedio (AOV,
 * USD — appended last). `comisionPendienteMN` uses `positiveIsGood={false}`
 * — more owed is worse, even though the arrow direction itself is unchanged.
 */
export function FinanceKpiHeader({ kpis }: FinanceKpiHeaderProps) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile
        label="Ingresos facturados"
        value={formatMoney(kpis.ingresosFacturadosUSD.current, MONEY)}
        trend={kpis.ingresosFacturadosUSD.trend}
        delta={kpis.ingresosFacturadosUSD.delta}
        help={<InfoPopover {...FINANZAS_HELP.ingresosFacturados} />}
      />
      <StatTile
        label="Ingresos liquidados"
        value={`${kpis.ingresosLiquidadosMN.current} MN`}
        trend={kpis.ingresosLiquidadosMN.trend}
        delta={kpis.ingresosLiquidadosMN.delta}
        help={<InfoPopover {...FINANZAS_HELP.ingresosLiquidados} />}
      />
      <StatTile
        label="Comisión pendiente"
        value={`${kpis.comisionPendienteMN.current} MN`}
        trend={kpis.comisionPendienteMN.trend}
        delta={kpis.comisionPendienteMN.delta}
        positiveIsGood={false}
        help={<InfoPopover {...FINANZAS_HELP.comisionPendiente} />}
      />
      <StatTile
        label="Margen neto"
        value={formatMoney(kpis.margenNetoUSD.current, MONEY)}
        trend={kpis.margenNetoUSD.trend}
        delta={kpis.margenNetoUSD.delta}
        sublabel={`${kpis.margenPercent.toFixed(1)}%`}
        help={<InfoPopover {...FINANZAS_HELP.margenNeto} />}
      />
      <StatTile
        label="Ticket promedio"
        value={formatMoney(kpis.aovUSD.current, MONEY)}
        trend={kpis.aovUSD.trend}
        delta={kpis.aovUSD.delta}
        help={<InfoPopover {...FINANZAS_HELP.ticketPromedio} />}
      />
    </section>
  );
}
