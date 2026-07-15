import { useState } from 'react';
import type { Route } from './+types/finanzas';
import { buildFinanceDashboard } from '../domain/finanzas-dashboard';
import { loadSeedState } from '../store/seed-store';
import { FinanceKpiHeader } from '../components/finanzas/finance-kpi-header';
import { RevenueTrendSection } from '../components/finanzas/revenue-trend-section';
import { CommissionLiabilityDonut } from '../components/finanzas/commission-liability-donut';
import { RevenueByStateBars } from '../components/finanzas/revenue-by-state-bars';
import { CurrencyExposureDonut } from '../components/finanzas/currency-exposure-donut';
import { GestorCommissionTable } from '../components/finanzas/gestor-commission-table';
import { WarehouseRevenue } from '../components/finanzas/warehouse-revenue';
import { StateBreakdownTable } from '../components/finanzas/state-breakdown-table';
import { ProductMarginBars } from '../components/finanzas/product-margin-bars';
import { LowMarginOrders } from '../components/finanzas/low-margin-orders';

export function meta(_args: Route.MetaArgs) {
  return [{ title: 'Finanzas — Sales Ops Cockpit' }];
}

/**
 * Read-only 3-layer financial control panel driven by local `useState` —
 * direct render, no RR7 `<Form>`/action/loader, no `useNavigate` (sidesteps
 * the jsdom+undici `AbortSignal` gotcha), mirroring `decisiones.tsx`.
 * Computes its view model once from `loadSeedState()` via
 * `buildFinanceDashboard`; exposes no mutation affordance at all.
 *
 * Layer 1 (KPI header) and Layer 3's gestor/warehouse blocks render only
 * when `view.hasData`; Layer 3's "Flujo por estado" is exempt from the
 * empty-state because it counts every state including `creado`.
 */
export default function Finanzas() {
  const [view] = useState(() => buildFinanceDashboard(loadSeedState()));

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold text-text">Finanzas</h1>
      <p className="mt-1 text-sm text-text-muted">Comisiones y flujo de caja</p>

      {!view.hasData && (
        <p className="mt-4 text-sm text-text-muted">
          No hay pedidos verificados o posteriores todavía — el panel financiero aparecerá aquí una vez existan.
        </p>
      )}

      {view.hasData && (
        <div className="mt-6">
          <FinanceKpiHeader kpis={view.kpis} />
        </div>
      )}

      {view.hasData && (
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <RevenueTrendSection trend={view.revenueTrend} />
          <RevenueByStateBars revenueByState={view.revenueByState} />
          <CommissionLiabilityDonut commissionLiability={view.commissionLiability} />
          <CurrencyExposureDonut currencyExposure={view.currencyExposure} />
        </div>
      )}

      {view.hasData && (
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <GestorCommissionTable gestorCommission={view.gestorCommission} />
          <WarehouseRevenue warehouseRevenue={view.warehouseRevenue} />
          <ProductMarginBars productMargin={view.productMargin} />
          <LowMarginOrders lowMarginOrders={view.lowMarginOrders} />
        </div>
      )}

      <div className="mt-8">
        <StateBreakdownTable rows={view.stateBreakdown} />
      </div>
    </main>
  );
}
