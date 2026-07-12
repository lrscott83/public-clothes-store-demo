import { formatMoney } from '@store-mgmt/storefront/config';
import { StatTile } from '../charts/stat-tile';
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
      <StatTile label="Ventas" value={formatMoney(kpis.ventasUSD.current, MONEY)} delta={kpis.ventasUSD.delta} />
      <StatTile
        label="Margen"
        value={formatMoney(kpis.margenUSD.current, MONEY)}
        delta={kpis.margenUSD.delta}
        sublabel={`${kpis.margenPercent.toFixed(1)}%`}
      />
      <StatTile
        label="Pedidos"
        value={String(kpis.pedidos.current)}
        delta={kpis.pedidos.delta}
        sublabel={`AOV ${formatMoney(kpis.aovUSD.current, MONEY)}`}
      />
      <StatTile
        label="Comisión pendiente"
        value={`${kpis.comisionPendienteMN.current} MN`}
        delta={kpis.comisionPendienteMN.delta}
        positiveIsGood={false}
      />
      <StatTile
        label="Cobrado vs pendiente"
        value={formatMoney(kpis.cobradoUSD.current, MONEY)}
        delta={kpis.cobradoUSD.delta}
        sublabel={`Pendiente ${formatMoney(kpis.pendienteUSD.current, MONEY)}`}
      />
    </section>
  );
}
