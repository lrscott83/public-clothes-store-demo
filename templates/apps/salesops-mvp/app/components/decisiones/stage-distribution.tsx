import { BarChart } from '../charts/bar-chart';
import type { StageDistributionView } from '../../domain/decisiones-dashboard';

export interface StageDistributionProps {
  stages: StageDistributionView;
}

/**
 * Layer 2b — "Pedidos por etapa": a snapshot distribution, NOT a conversion
 * funnel. One vertical bar per `OrderState` (fixed order, zero-count states
 * included). Copy explicitly avoids funnel/conversion language.
 */
export function StageDistribution({ stages }: StageDistributionProps) {
  const bars = stages.rows.map((row) => ({ label: row.label, value: row.count }));

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h2 className="text-lg font-semibold text-text">Pedidos por etapa</h2>
      <p className="text-xs text-text-muted">Distribución actual de pedidos por estado (instantánea, no un embudo).</p>
      <div className="mt-2">
        <BarChart bars={bars} orientation="vertical" ariaLabel="Pedidos por etapa" />
      </div>
    </div>
  );
}
