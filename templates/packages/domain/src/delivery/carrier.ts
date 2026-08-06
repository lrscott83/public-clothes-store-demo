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
 */
export function createCarrier(input: CreateCarrierInput): Carrier {
  const now = new Date();
  return {
    id: input.id ?? randomUUID(),
    name: input.name,
    phone: input.phone ?? null,
    active: input.active ?? true,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}
