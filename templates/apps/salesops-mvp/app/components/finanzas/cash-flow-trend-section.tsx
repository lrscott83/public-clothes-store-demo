import { useState } from 'react';
import { formatMoney } from '@store-mgmt/storefront/config';
import { AreaTrend } from '../charts/area-trend';
import { InfoPopover } from '../shared/info-popover';
import { FINANZAS_HELP } from './help-content';
import type { CashFlowTrendView } from '../../domain/finanzas-dashboard';

export interface CashFlowTrendSectionProps {
  trend: CashFlowTrendView;
}

const MONEY = { locale: 'en-US', currency: 'USD' } as const;

type Series = 'cobrado' | 'pendiente';

/**
 * Layer 2a — 20-day cash-flow trend with a local cobrado/pendiente toggle
 * (`useState`, view-only, never re-reads `SeedState`). `AreaTrend` is
 * locked to a single polyline, so this mirrors `SalesTrendSection`'s proven
 * pattern instead of rendering two side-by-side charts.
 */
export function CashFlowTrendSection({ trend }: CashFlowTrendSectionProps) {
  const [series, setSeries] = useState<Series>('cobrado');

  const points = trend.points.map((point) => ({
    label: `d-${point.dayOffset}`,
    value: series === 'cobrado' ? point.cobradoUSD : point.pendienteUSD,
  }));

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <h2 className="text-lg font-semibold text-text">Cobros estimados por estado (20 días)</h2>
          <InfoPopover {...FINANZAS_HELP.tendenciaCobros} />
        </div>
        <div className="flex gap-1 text-xs">
          <button
            type="button"
            onClick={() => setSeries('cobrado')}
            className={`rounded px-2 py-1 ${series === 'cobrado' ? 'bg-primary text-white' : 'text-text-muted'}`}
          >
            Cobrado
          </button>
          <button
            type="button"
            onClick={() => setSeries('pendiente')}
            className={`rounded px-2 py-1 ${series === 'pendiente' ? 'bg-primary text-white' : 'text-text-muted'}`}
          >
            Pendiente
          </button>
        </div>
      </div>
      <div className="mt-2">
        <AreaTrend
          points={points}
          ariaLabel={`Cobros estimados — ${series === 'cobrado' ? 'cobrado' : 'pendiente'}`}
          formatValue={(value) => formatMoney(value, MONEY)}
        />
      </div>
    </div>
  );
}
