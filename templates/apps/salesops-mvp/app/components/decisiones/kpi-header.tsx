import { formatMoney } from '@store-mgmt/storefront/config';
import { StatTile } from '../charts/stat-tile';
import { InfoPopover } from './info-popover';
import { DECISIONES_HELP } from './help-content';
import type { KpiHeaderView } from '../../domain/decisiones-dashboard';

export interface KpiHeaderProps {
  kpis: KpiHeaderView;
}

const MONEY = { locale: 'en-US', currency: 'USD' } as const;

/**
 * Layer 1 — exactly 5 `StatTile`s in the fixed order: Ventas, Margen,
 * Pedidos (+AOV sublabel), Comisión pendiente (MN plain text, never
 * `formatMoney`), Cobrado vs pendiente. Formats only at this leaf — the
 * domain builder hands back raw numbers + trend deltas.
 */
export function KpiHeader({ kpis }: KpiHeaderProps) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <StatTile
        label="Ventas"
        value={formatMoney(kpis.ventasUSD.current, MONEY)}
        trend={kpis.ventasUSD.trend}
        delta={kpis.ventasUSD.delta}
        help={<InfoPopover {...DECISIONES_HELP.ventas} />}
      />
      <StatTile
        label="Margen"
        value={formatMoney(kpis.margenUSD.current, MONEY)}
        trend={kpis.margenUSD.trend}
        delta={kpis.margenUSD.delta}
        sublabel={`${kpis.margenPercent.toFixed(1)}%`}
        help={<InfoPopover {...DECISIONES_HELP.margen} />}
      />
      <StatTile
        label="Pedidos"
        value={String(kpis.pedidos.current)}
        trend={kpis.pedidos.trend}
        delta={kpis.pedidos.delta}
        sublabel={`AOV ${formatMoney(kpis.aovUSD.current, MONEY)}`}
        help={<InfoPopover {...DECISIONES_HELP.pedidos} />}
      />
      <StatTile
        label="Comisión pendiente"
        value={`${kpis.comisionPendienteMN.current} MN`}
        trend={kpis.comisionPendienteMN.trend}
        delta={kpis.comisionPendienteMN.delta}
        positiveIsGood={false}
        help={<InfoPopover {...DECISIONES_HELP.comisionPendiente} />}
      />
      <StatTile
        label="Cobrado vs pendiente"
        value={formatMoney(kpis.cobradoUSD.current, MONEY)}
        trend={kpis.cobradoUSD.trend}
        delta={kpis.cobradoUSD.delta}
        sublabel={`Pendiente ${formatMoney(kpis.pendienteUSD.current, MONEY)}`}
        help={<InfoPopover {...DECISIONES_HELP.cobradoPendiente} />}
      />
    </section>
  );
}
