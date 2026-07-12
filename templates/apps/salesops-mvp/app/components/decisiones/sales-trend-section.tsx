import { useState } from 'react';
import { formatMoney } from '@store-mgmt/storefront/config';
import { AreaTrend } from '../charts/area-trend';
import type { SalesTrendView } from '../../domain/decisiones-dashboard';

export interface SalesTrendSectionProps {
  trend: SalesTrendView;
}

const MONEY = { locale: 'en-US', currency: 'USD' } as const;

type Series = 'cantidad' | 'valor';

/**
 * Layer 2a — 20-day sales trend with a local cantidad/valor toggle
 * (`useState`, view-only, never re-reads `SeedState`). "Valor" formats via
 * `formatMoney`; "cantidad" is a plain integer count.
 */
export function SalesTrendSection({ trend }: SalesTrendSectionProps) {
  const [series, setSeries] = useState<Series>('valor');

  const points = trend.points.map((point) => ({
    label: `d-${point.dayOffset}`,
    value: series === 'valor' ? point.valueUSD : point.count,
  }));
  const formatValue = series === 'valor' ? (value: number) => formatMoney(value, MONEY) : (value: number) => String(value);

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text">Tendencia de ventas (20 días)</h2>
        <div className="flex gap-1 text-xs">
          <button
            type="button"
            onClick={() => setSeries('valor')}
            className={`rounded px-2 py-1 ${series === 'valor' ? 'bg-primary text-white' : 'text-text-muted'}`}
          >
            Valor
          </button>
          <button
            type="button"
            onClick={() => setSeries('cantidad')}
            className={`rounded px-2 py-1 ${series === 'cantidad' ? 'bg-primary text-white' : 'text-text-muted'}`}
          >
            Cantidad
          </button>
        </div>
      </div>
      <div className="mt-2">
        <AreaTrend points={points} ariaLabel={`Tendencia de ventas por ${series}`} formatValue={formatValue} />
      </div>
    </div>
  );
}
