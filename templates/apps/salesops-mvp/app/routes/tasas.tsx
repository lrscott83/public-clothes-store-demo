import { useState } from 'react';
import type { Route } from './+types/tasas';
import { RatesForm, parseRatesDraft, ratesToDraft, type RatesFormDraft } from '../components/tasas/rates-form';
import { loadSeedState, updateExchangeRates } from '../store/seed-store';

export function meta(_args: Route.MetaArgs) {
  return [{ title: 'Tasas de cambio — Sales Ops Cockpit' }];
}

/**
 * Tasas editor container driven by local `useState` — direct render, no RR7
 * `<Form>`/action/loader, no `useNavigate` (sidesteps the jsdom+undici
 * `AbortSignal` gotcha), mirroring `operador-gestores`. Seeds the draft from
 * the persisted `SeedState.exchangeRates` on mount; saving parses the draft
 * and calls `updateExchangeRates`, the single source of truth after a write.
 */
export default function Tasas() {
  const [draft, setDraft] = useState<RatesFormDraft>(() => ratesToDraft(loadSeedState().exchangeRates));
  const [saved, setSaved] = useState(false);

  function handleChange(nextDraft: RatesFormDraft) {
    setDraft(nextDraft);
    setSaved(false);
  }

  function handleSave() {
    const rates = parseRatesDraft(draft);
    if (!rates) return;

    updateExchangeRates(rates);
    setSaved(true);
  }

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold text-text">Tasas de cambio</h1>
      <RatesForm draft={draft} onChange={handleChange} onSave={handleSave} saved={saved} />
    </main>
  );
}
