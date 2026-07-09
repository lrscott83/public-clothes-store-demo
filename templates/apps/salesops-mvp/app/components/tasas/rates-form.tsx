import type { ExchangeRates } from '../../domain/types';

export interface RatesFormDraft {
  usdToMn: string;
  zelle: string;
  eur: string;
}

export interface RatesFormProps {
  draft: RatesFormDraft;
  onChange: (draft: RatesFormDraft) => void;
  onSave: () => void;
  saved?: boolean;
}

/**
 * Parses a string-keyed `RatesFormDraft` into a numeric `ExchangeRates`, or
 * `null` if any field is empty, non-numeric, or `<= 0`. This is the single
 * source of truth for "is this draft valid" — shared by `RatesForm` (Save
 * gating + inline errors) and the `/tasas` container (save-time parse).
 */
export function parseRatesDraft(draft: RatesFormDraft): ExchangeRates | null {
  const usdToMn = Number(draft.usdToMn);
  const zelle = Number(draft.zelle);
  const eur = Number(draft.eur);

  const isValid = (raw: string, value: number) =>
    raw.trim() !== '' && Number.isFinite(value) && value > 0;

  if (!isValid(draft.usdToMn, usdToMn) || !isValid(draft.zelle, zelle) || !isValid(draft.eur, eur)) {
    return null;
  }

  return { usdToMn, zelle, eur };
}

/** Converts a numeric `ExchangeRates` into a string-keyed `RatesFormDraft`. */
export function ratesToDraft(rates: ExchangeRates): RatesFormDraft {
  return {
    usdToMn: String(rates.usdToMn),
    zelle: String(rates.zelle),
    eur: String(rates.eur),
  };
}

function fieldError(raw: string): string | null {
  if (raw.trim() === '') return 'Requerido';
  const value = Number(raw);
  if (!Number.isFinite(value)) return 'Debe ser un número';
  if (value <= 0) return 'Debe ser mayor a 0';
  return null;
}

/**
 * Tasas editor: three numeric inputs (USD→MN, Zelle, EUR). Purely
 * presentational — the container owns the draft; every field change calls
 * `onChange` with the next full draft. "Guardar" is enabled only when
 * `parseRatesDraft(draft)` is non-null; each invalid field shows an inline
 * error below it. `saved` renders a confirmation message.
 */
export function RatesForm({ draft, onChange, onSave, saved }: RatesFormProps) {
  const canSave = parseRatesDraft(draft) !== null;

  function set<K extends keyof RatesFormDraft>(key: K, value: RatesFormDraft[K]) {
    onChange({ ...draft, [key]: value });
  }

  const usdToMnError = fieldError(draft.usdToMn);
  const zelleError = fieldError(draft.zelle);
  const eurError = fieldError(draft.eur);

  return (
    <section>
      <div className="mt-4 flex max-w-md flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm text-text">
          USD→MN
          <input
            type="number"
            value={draft.usdToMn}
            onChange={(event) => set('usdToMn', event.target.value)}
            className="rounded border border-border px-3 py-2"
          />
          {usdToMnError && <span className="text-sm text-red-600">{usdToMnError}</span>}
        </label>

        <label className="flex flex-col gap-1 text-sm text-text">
          Zelle
          <input
            type="number"
            value={draft.zelle}
            onChange={(event) => set('zelle', event.target.value)}
            className="rounded border border-border px-3 py-2"
          />
          {zelleError && <span className="text-sm text-red-600">{zelleError}</span>}
        </label>

        <label className="flex flex-col gap-1 text-sm text-text">
          EUR
          <input
            type="number"
            value={draft.eur}
            onChange={(event) => set('eur', event.target.value)}
            className="rounded border border-border px-3 py-2"
          />
          {eurError && <span className="text-sm text-red-600">{eurError}</span>}
        </label>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="rounded bg-primary px-4 py-2 text-white disabled:opacity-50"
        >
          Guardar
        </button>
        {saved && <span className="text-sm text-green-600">Tasas guardadas</span>}
      </div>
    </section>
  );
}
