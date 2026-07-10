export interface ClientStepDraft {
  name: string;
  phone: string;
  address: string;
  deliveryMode: 'domicilio' | 'recogida';
  method: string;
  needsChange: boolean;
  observations: string;
}

export interface ClientStepProps {
  draft: ClientStepDraft;
  onChange: (draft: ClientStepDraft) => void;
  onBack: () => void;
}

/**
 * Cliente step: captures nombre, teléfono, dirección (only when
 * deliveryMode === 'domicilio'), delivery mode, forma de pago, "¿lleva
 * cambio?", and observaciones. Purely presentational — the container owns
 * the draft; every field change calls `onChange` with the next full draft.
 * "Siguiente" is enabled only when name && phone && (mode !== 'domicilio'
 * || address).
 */
export function ClientStep({ draft, onChange, onBack }: ClientStepProps) {

  function set<K extends keyof ClientStepDraft>(key: K, value: ClientStepDraft[K]) {
    onChange({ ...draft, [key]: value });
  }

  return (
    <section className="p-8">
      <h2 className="text-xl font-semibold text-text">Cliente</h2>

      <div className="mt-4 flex max-w-md flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm text-text">
          Nombre
          <input
            type="text"
            value={draft.name}
            onChange={(event) => set('name', event.target.value)}
            className="rounded border border-border px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-text">
          Teléfono
          <input
            type="text"
            value={draft.phone}
            onChange={(event) => set('phone', event.target.value)}
            className="rounded border border-border px-3 py-2"
          />
        </label>

        <fieldset className="flex flex-col gap-1 text-sm text-text">
          <legend>Modalidad de entrega</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="deliveryMode"
              value="domicilio"
              checked={draft.deliveryMode === 'domicilio'}
              onChange={() => set('deliveryMode', 'domicilio')}
            />
            Domicilio
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="deliveryMode"
              value="recogida"
              checked={draft.deliveryMode === 'recogida'}
              onChange={() => set('deliveryMode', 'recogida')}
            />
            Recogida
          </label>
        </fieldset>

        {draft.deliveryMode === 'domicilio' && (
          <label className="flex flex-col gap-1 text-sm text-text">
            Dirección
            <input
              type="text"
              required
              value={draft.address}
              onChange={(event) => set('address', event.target.value)}
              className="rounded border border-border px-3 py-2"
            />
          </label>
        )}

        <label className="flex flex-col gap-1 text-sm text-text">
          Forma de pago
          <input
            type="text"
            value={draft.method}
            onChange={(event) => set('method', event.target.value)}
            className="rounded border border-border px-3 py-2"
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={draft.needsChange}
            onChange={(event) => set('needsChange', event.target.checked)}
          />
          ¿Lleva cambio?
        </label>

        <label className="flex flex-col gap-1 text-sm text-text">
          Observaciones
          <textarea
            value={draft.observations}
            onChange={(event) => set('observations', event.target.value)}
            className="rounded border border-border px-3 py-2"
          />
        </label>
      </div>

    </section>
  );
}
