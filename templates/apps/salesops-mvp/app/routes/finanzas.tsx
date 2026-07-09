import { useState } from 'react';
import type { Route } from './+types/finanzas';
import { buildFinanceSummary } from '../domain/finanzas';
import { loadSeedState } from '../store/seed-store';
import { CommissionSummary } from '../components/finanzas/commission-summary';
import { StateBreakdownTable } from '../components/finanzas/state-breakdown-table';

export function meta(_args: Route.MetaArgs) {
  return [{ title: 'Finanzas — Sales Ops Cockpit' }];
}

/**
 * Read-only commission & cash-flow container driven by local `useState` —
 * direct render, no RR7 `<Form>`/action/loader, no `useNavigate` (sidesteps
 * the jsdom+undici `AbortSignal` gotcha), mirroring `decisiones.tsx`.
 * Computes its view model once from `loadSeedState()` via
 * `buildFinanceSummary`; no mutation affordance — marking a commission paid
 * lives only in `/operador-gestores`. The `<h1>` is the single word
 * "Finanzas"; "Comisiones y flujo de caja" renders as a non-heading `<p>`
 * subtitle so `routes.test.tsx`'s `getByRole('heading', { name: /finanzas/i
 * })` stays unambiguous.
 */
export default function Finanzas() {
  const [view] = useState(() => buildFinanceSummary(loadSeedState()));

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold text-text">Finanzas</h1>
      <p className="mt-1 text-sm text-text-muted">Comisiones y flujo de caja</p>
      <CommissionSummary kpis={view.kpis} />
      <div className="mt-8">
        <StateBreakdownTable rows={view.rows} />
      </div>
    </main>
  );
}
