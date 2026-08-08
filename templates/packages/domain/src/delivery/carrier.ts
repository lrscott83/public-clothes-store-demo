import { randomUUID } from 'node:crypto';

/**
 * Carrier catalog entity — tenant master data (design §7). Mirrors
 * `Warehouse`'s shape: FLAT, no address/geography hierarchy. Deliberately
 * carries no `zone` field and no stored capacity field — coverage lives
 * exclusively in `CarrierWarehouse`, capacity is computed exclusively by
 * `computeCarrierCapacity` (D2/D3, design §5/§4).
 */
export interface Carrier {
  readonly id: string;
  readonly name: string;
  readonly phone: string | null;
  readonly active: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Input to `createCarrier`. `id`/`createdAt`/`updatedAt` are optional so the
 * factory can mint a brand-new carrier (defaults applied). `phone` is
 * optional and defaults to `null` — never an empty string.
 */
export interface CreateCarrierInput {
  readonly id?: string;
  readonly name: string;
  readonly phone?: string | null;
  readonly active?: boolean;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

/**
 * Constructs a `Carrier`. Unlike `Warehouse`/`Customer`, the spec defines no
 * rejection scenario for `name` — it is required by the TYPE, not guarded at
 * runtime with a named error (`salesops-delivery/spec.md`'s Carrier
 * requirement lists no "rejects empty name" scenario). Soft-delete is owned
 * by `ICarrierRepository.softDelete` at the infra layer (Phase 3), mirroring
 * `IWarehouseRepository.softDelete` — never a hard `DELETE`.
 *
 * `name` and `phone` are TRIMMED here. The HTTP boundary validates them by
 * trimming (`assertNonEmptyString`) and then forwards the untrimmed value, so
 * without this `{"name":"  Envíos  "}` was validated as one string and stored
 * as another. Normalizing at the factory keeps "what was validated" and "what
 * is stored" the same string, in the one place the Carrier's field rules
 * already live (same reason the `phone`/`active` defaults live here).
 */
export function createCarrier(input: CreateCarrierInput): Carrier {
  const now = new Date();
  return {
    id: input.id ?? randomUUID(),
    name: input.name.trim(),
    phone: input.phone === undefined || input.phone === null ? null : input.phone.trim(),
    active: input.active ?? true,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

/** A `CarrierUpdateInput`-shaped patch, narrowed to the fields that need normalizing. */
export interface CarrierPatchFields {
  readonly name?: string;
  readonly phone?: string | null;
}

/**
 * The `PATCH` counterpart of `createCarrier`'s trimming. The update path never
 * goes through the factory — the adapter writes the patch's fields directly —
 * so without this, `POST` stored a trimmed name and `PATCH` stored a padded
 * one for the same input. One rule, both writers.
 *
 * Only the keys actually PRESENT on `patch` come back, so an absent field
 * stays absent and never clears a column by accident.
 */
export function normalizeCarrierPatch<T extends CarrierPatchFields>(patch: T): T {
  return {
    ...patch,
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.phone !== undefined ? { phone: patch.phone === null ? null : patch.phone.trim() } : {}),
  };
}
