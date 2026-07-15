import { useState } from 'react';
import { formatMoney } from '@store-mgmt/storefront/config';
import { AreaTrend } from '../charts/area-trend';
import { InfoPopover } from '../shared/info-popover';
import { DECISIONES_HELP } from './help-content';
import type { CompletadosPorDiaView } from '../../domain/decisiones-dashboard';

export interface CompletadosPorDiaProps {
  completados: CompletadosPorDiaView;
}

const MONEY = { locale: 'en-US', currency: 'USD' } as const;

type Series = 'cantidad' | 'valor';

/**
 * Capa 3 — "Completados por día": one point per calendar day in the
 * selected `[7d/30d]` window (zero-padded, grouped by `deliveredAt`), same
 * Nº pedidos/Valor de venta toggle semantics as `PedidosPorDia`. Also shows
 * **tasa de completado** — always visible, independent of the toggle, since
 * `CompletadosPorDiaView.tasaCompletado` arrives already computed against
 * the window's entry cohort (locked denominator, ÷0-safe). The Δ% line only
 * applies to the Nº series (`countDeltaPercent` — the view has no
 * value-series delta by design).
 */
export function CompletadosPorDia({ completados }: CompletadosPorDiaProps) {
  const [series, setSeries] = useState<Series>('cantidad');

  const points = completados.points.map((point) => ({
    label: `d-${point.dayOffset}`,
    value: series === 'valor' ? point.valueUSD : point.count,
  }));
  const formatValue =
    series === 'valor' ? (value: number) => formatMoney(value, MONEY) : (value: number) => String(value);

  const avg = series === 'valor' ? completados.avgValuePerDay : completados.avgCountPerDay;
  const deltaPercent = completados.countDeltaPercent;
  const isUp = deltaPercent !== null ? deltaPercent > 0 : completados.avgCountPerDay > 0;
  const isDown = deltaPercent !== null && deltaPercent < 0;
  const colorClass = !isUp && !isDown ? 'text-text-muted' : isUp ? 'text-success' : 'text-danger';

  const tasaPercent = Math.round(completados.tasaCompletado * 100);

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <h2 className="text-lg font-semibold text-text">Completados por día</h2>
          <InfoPopover {...DECISIONES_HELP.completadosPorDia} />
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
      <div className="mt-2 flex items-baseline gap-4">
        <p className="text-2xl font-semibold text-text">
          {series === 'valor' ? formatMoney(avg, MONEY) : avg.toFixed(1)}
          <span className="text-sm font-normal text-text-muted"> / día</span>
        </p>
        <p className="text-sm text-text-muted">
          Tasa de completado: <span className="font-semibold text-text">{tasaPercent}%</span>
        </p>
      </div>
      {series === 'cantidad' && (
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
      )}
      <div className="mt-2">
        <AreaTrend points={points} ariaLabel={`Completados por día por ${series}`} formatValue={formatValue} />
      </div>
    </div>
  );
}
