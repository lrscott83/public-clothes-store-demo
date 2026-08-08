import { useState } from 'react';
import type { Route } from './+types/inventario';
import { buildInventorySummary } from '../domain/inventory';
import { loadSeedState } from '../store/seed-store';
import { InventorySummary } from '../components/inventario/inventory-summary';
import { WarehouseTabs } from '../components/inventario/warehouse-tabs';

export function meta(_args: Route.MetaArgs) {
  return [{ title: 'Inventario — Sales Ops Cockpit' }];
}

/**
 * Read-only inventory container driven by local `useState` — direct render,
 * no RR7 `<Form>`/action/loader, no `useNavigate` (sidesteps the jsdom+undici
 * `AbortSignal` gotcha), mirroring `tasas.tsx`. Computes its view model once
 * from `loadSeedState()` via `buildInventorySummary`; no mutation affordance.
 */
export default function Inventario() {
  const [summary] = useState(() => buildInventorySummary(loadSeedState()));

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold text-text">Inventario</h1>
      <InventorySummary summary={summary} />
      <div className="mt-8">
        <WarehouseTabs warehouses={summary.warehouses} />
      </div>
    </main>
  );
}
