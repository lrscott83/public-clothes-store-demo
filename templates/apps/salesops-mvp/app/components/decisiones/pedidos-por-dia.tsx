import { useState } from 'react';
import { formatMoney } from '@store-mgmt/storefront/config';
import { AreaTrend } from '../charts/area-trend';
import { InfoPopover } from '../shared/info-popover';
import { DECISIONES_HELP } from './help-content';
import type { PedidosPorDiaView } from '../../domain/decisiones-dashboard';

export interface PedidosPorDiaProps {
  pedidos: PedidosPorDiaView;
}

const MONEY = { locale: 'en-US', currency: 'USD' } as const;

type Series = 'cantidad' | 'valor';

/**
 * Capa 3 — "Pedidos por día": one point per calendar day in the selected
 * `[7d/30d]` window (zero-padded, grouped by `createdAt`), with a local
 * Nº pedidos/Valor de venta toggle (`useState`, view-only — never re-reads
 * `SeedState`). Shows the average per day and Δ% vs. the immediately
 * preceding window of equal length. A `null` delta (prior average 0) with a
 * positive current average renders a safe "▲ nuevo" guard instead of a
 * misleading "Infinity%".
 */
export function PedidosPorDia({ pedidos }: PedidosPorDiaProps) {
  const [series, setSeries] = useState<Series>('cantidad');

  const points = pedidos.points.map((point) => ({
    label: `d-${point.dayOffset}`,
    value: series === 'valor' ? point.valueUSD : point.count,
  }));
  const formatValue =
    series === 'valor' ? (value: number) => formatMoney(value, MONEY) : (value: number) => String(value);

  const avg = series === 'valor' ? pedidos.avgValuePerDay : pedidos.avgCountPerDay;
  const deltaPercent = series === 'valor' ? pedidos.valueDeltaPercent : pedidos.countDeltaPercent;
  const currentAvgForGuard = series === 'valor' ? pedidos.avgValuePerDay : pedidos.avgCountPerDay;
  const isUp = deltaPercent !== null ? deltaPercent > 0 : currentAvgForGuard > 0;
  const isDown = deltaPercent !== null && deltaPercent < 0;
  const colorClass = !isUp && !isDown ? 'text-text-muted' : isUp ? 'text-success' : 'text-danger';

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <h2 className="text-lg font-semibold text-text">Pedidos por día</h2>
          <InfoPopover {...DECISIONES_HELP.pedidosPorDia} />
        </div>
        <div className="flex gap-1 text-xs">
          <button
            type="button"
            onClick={() => setSeries('cantidad')}
            className={`rounded px-2 py-1 ${series === 'cantidad' ? 'bg-primary text-white' : 'text-text-muted'}`}
          >
            Nº pedidos
          </button>
          <button
            type="button"
            onClick={() => setSeries('valor')}
            className={`rounded px-2 py-1 ${series === 'valor' ? 'bg-primary text-white' : 'text-text-muted'}`}
          >
            Valor de venta
          </button>
        </div>
      </div>
      <p className="mt-2 text-2xl font-semibold text-text">
        {series === 'valor' ? formatMoney(avg, MONEY) : avg.toFixed(1)}
        <span className="text-sm font-normal text-text-muted"> / día</span>
      </p>
      <div className="mt-1 flex items-center gap-1 text-sm">
        {deltaPercent !== null ? (
          <>
            <span className={colorClass}>{isUp ? '▲' : isDown ? '▼' : '—'}</span>
            <span className={colorClass}>{Math.abs(deltaPercent * 100).toFixed(0)}% vs período anterior</span>
          </>
        ) : isUp ? (
          <>
            <span className="text-success">▲</span>
            <span className="text-success">nuevo vs período anterior</span>
          </>
        ) : (
          <span className="text-text-muted">— sin cambio vs período anterior</span>
        )}
      </div>
      <div className="mt-2">
        <AreaTrend points={points} ariaLabel={`Pedidos por día por ${series}`} formatValue={formatValue} />
      </div>
    </div>
  );
}
