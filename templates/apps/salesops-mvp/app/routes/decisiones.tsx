import { useState } from 'react';
import type { Route } from './+types/decisiones';
import { buildDecisionesDashboard } from '../domain/decisiones-dashboard';
import { loadSeedState } from '../store/seed-store';
import { KpiHeader } from '../components/decisiones/kpi-header';
import { SalesTrendSection } from '../components/decisiones/sales-trend-section';
import { StageDistribution } from '../components/decisiones/stage-distribution';
import { WarehouseSales } from '../components/decisiones/warehouse-sales';
import { CurrencyMix } from '../components/decisiones/currency-mix';
import { GestorRanking } from '../components/decisiones/gestor-ranking';
import { InventoryAlerts } from '../components/decisiones/inventory-alerts';

export function meta(_args: Route.MetaArgs) {
  return [{ title: 'Decisiones — Sales Ops Cockpit' }];
}

/**
 * Read-only 3-layer decision dashboard driven by local `useState` — direct
 * render, no RR7 `<Form>`/action/loader, no `useNavigate` (sidesteps the
 * jsdom+undici `AbortSignal` gotcha), mirroring `inventario.tsx`. Computes
 * its view model once from `loadSeedState()` via `buildDecisionesDashboard`;
 * no mutation affordance beyond the local cantidad/valor trend toggle.
 *
 * Layer 1 (KPI header) and Layer 3 (actionable blocks) render only when
 * `view.hasData`; Layer 2's "Pedidos por etapa" is exempt from the
 * empty-state because it counts `creado` orders too and can legitimately
 * show a single non-empty bar.
 */
export default function Decisiones() {
  const [view] = useState(() => buildDecisionesDashboard(loadSeedState()));

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold text-text">Decisiones</h1>

      {!view.hasData && (
        <p className="mt-4 text-sm text-text-muted">
          No hay pedidos verificados o posteriores todavía — el dashboard aparecerá aquí una vez existan.
        </p>
      )}

      {view.hasData && (
        <div className="mt-6">
          <KpiHeader kpis={view.kpis} />
        </div>
      )}

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {/* "Pedidos por etapa" is exempt from the empty-state — it counts
            `creado` orders too and can legitimately show a single bar. */}
        <StageDistribution stages={view.stages} />
        {view.hasData && (
          <>
            <SalesTrendSection trend={view.salesTrend} />
            <WarehouseSales warehouses={view.warehouses} />
            <CurrencyMix currencyMix={view.currencyMix} />
          </>
        )}
      </div>

      {view.hasData && (
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {/* period/onPeriodChange are inert here — real windowedState wiring lands with the route recomposition (PR7) */}
          <GestorRanking gestores={view.gestores} period="general" onPeriodChange={() => {}} />
          <InventoryAlerts alerts={view.inventoryAlerts} />
        </div>
      )}
    </main>
  );
}
