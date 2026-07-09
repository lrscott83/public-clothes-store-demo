import { useState } from 'react';
import type { Route } from './+types/decisiones';
import { buildProfitabilityRanking } from '../domain/decisiones';
import { loadSeedState } from '../store/seed-store';
import { ProfitabilitySummary } from '../components/decisiones/profitability-summary';
import { ProfitabilityTable } from '../components/decisiones/profitability-table';

export function meta(_args: Route.MetaArgs) {
  return [{ title: 'Decisiones — Sales Ops Cockpit' }];
}

/**
 * Read-only profitability ranking container driven by local `useState` —
 * direct render, no RR7 `<Form>`/action/loader, no `useNavigate` (sidesteps
 * the jsdom+undici `AbortSignal` gotcha), mirroring `inventario.tsx`.
 * Computes its view model once from `loadSeedState()` via
 * `buildProfitabilityRanking`; no mutation affordance. Renders an
 * empty-state message instead of the ranking table/summary card when zero
 * orders qualify (only `creado` orders exist).
 */
export default function Decisiones() {
  const [view] = useState(() => buildProfitabilityRanking(loadSeedState()));

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold text-text">Decisiones</h1>
      {view.count > 0 ? (
        <>
          <ProfitabilitySummary totals={view.totals} count={view.count} />
          <ProfitabilityTable rows={view.rows} />
        </>
      ) : (
        <p className="mt-4 text-sm text-text-muted">
          No hay pedidos verificados o posteriores todavía — el ranking aparecerá aquí una vez existan.
        </p>
      )}
    </main>
  );
}
