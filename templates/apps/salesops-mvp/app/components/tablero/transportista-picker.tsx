import type { Order, Transportista } from '../../domain/types';

export interface TransportistaPickerProps {
  order: Order;
  transportistas: Transportista[];
  selectedTransportistaId: string | null;
  onSelect: (transportistaId: string) => void;
  onConfirm: () => void;
  onBack: () => void;
}

/**
 * Picker view for assigning a carrier to a `verificado` order: radio
 * fieldset listing every seeded `Transportista` (name, plus `phone`/`zona`
 * when present). "Confirmar" stays disabled until a carrier is selected.
 * Mirrors `order-review.tsx`'s layout and `warehouse-step.tsx`'s
 * radio-fieldset picker pattern.
 */
export function TransportistaPicker({
  order,
  transportistas,
  selectedTransportistaId,
  onSelect,
  onConfirm,
  onBack,
}: TransportistaPickerProps) {
  const canConfirm = selectedTransportistaId !== null;

  return (
    <section className="p-8">
      <h2 className="text-xl font-semibold text-text">Asignar transportista — pedido {order.id}</h2>

      <fieldset className="mt-4 flex flex-col gap-2 text-sm text-text">
        <legend>Transportista</legend>
        {transportistas.map((transportista) => (
          <label key={transportista.id} className="flex items-center gap-2">
            <input
              type="radio"
              name="transportistaId"
              value={transportista.id}
              checked={selectedTransportistaId === transportista.id}
              onChange={() => onSelect(transportista.id)}
            />
            {transportista.name}
            {transportista.phone && <span className="text-text-muted"> — {transportista.phone}</span>}
            {transportista.zona && <span className="text-text-muted"> — {transportista.zona}</span>}
          </label>
        ))}
      </fieldset>

      <div className="mt-6 flex gap-3">
        <button type="button" onClick={onBack} className="rounded border border-border px-4 py-2">
          Atrás
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!canConfirm}
          className="rounded bg-primary px-4 py-2 text-white disabled:opacity-50"
        >
          Confirmar
        </button>
      </div>
    </section>
  );
}
