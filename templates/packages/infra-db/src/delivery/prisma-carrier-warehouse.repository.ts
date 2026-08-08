import { Injectable } from '@nestjs/common';
import type {
  CarrierWarehouse as DomainCarrierWarehouse,
  CreateCarrierWarehouseInput,
  ICarrierWarehouseRepository,
} from '@store-mgmt/domain';
import {
  CarrierNotFoundError,
  CoverageAlreadyDeclaredError,
  CoverageWarehouseNotFoundError,
  createCarrierWarehouse,
} from '@store-mgmt/domain';
import { Prisma } from '../../generated/tenant/client.js';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import { violatedConstraintCovers, violatedConstraintIs } from './prisma-constraint-target.js';

/**
 * The three constraints on `carrier_warehouse` that a `create` can violate,
 * spelled exactly as `prisma/tenant-schema.sql` declares them. Named
 * constants rather than inline substrings so a schema rename is a compile-
 * adjacent, greppable edit instead of a silently unreachable branch.
 */
const COVERAGE_UNIQUE_INDEX = 'carrier_warehouse_carrier_id_warehouse_id_key';
/** The same constraint, as the query engine reports it: the field list, not the index name. */
const COVERAGE_UNIQUE_FIELDS = ['carrier_id', 'warehouse_id'] as const;
const COVERAGE_WAREHOUSE_FK = 'carrier_warehouse_warehouse_id_fkey';
const COVERAGE_CARRIER_FK = 'carrier_warehouse_carrier_id_fkey';

/** Shape of every row Prisma returns for the `CarrierWarehouse` model. */
interface CarrierWarehouseRow {
  readonly id: string;
  readonly carrierId: string;
  readonly warehouseId: string;
  readonly createdAt: Date;
}

function toDomain(row: CarrierWarehouseRow): DomainCarrierWarehouse {
  return {
    id: row.id,
    carrierId: row.carrierId,
    warehouseId: row.warehouseId,
    createdAt: row.createdAt,
  };
}

/**
 * Translates `add`'s constraint violations into named domain errors.
 *
 * `@@unique([carrierId, warehouseId])` and both FKs remain THE enforcement
 * (spec: "enforced") — this only reports them in the domain's own vocabulary.
 * Now that `POST /delivery/carriers/:id/warehouses` exists, letting these
 * escape raw would answer a well-formed request naming a missing warehouse,
 * or an already-declared pair, with a 500. Same discipline (and the same
 * shared meta parser, `./prisma-constraint-target.js`) as
 * `prisma-delivery-assignment.repository.ts`'s own translator.
 *
 * EVERY branch is gated on WHICH constraint was violated:
 *
 * - P2002 used to be translated on the CODE ALONE, so any future unique
 *   index on this table — or a `carrier_warehouse_pkey` collision — would
 *   have been reported as "this carrier already covers that warehouse", a
 *   confident 409 about something that never happened. Its sibling in
 *   `prisma-delivery-assignment.repository.ts` already checked its target;
 *   this one did not.
 * - P2003's two branches used to be a substring race (`warehouse_id` tested
 *   before `carrier_id`), correct today only by accident of how Prisma spells
 *   these two constraint names. They now match the full names, so neither
 *   branch depends on being evaluated first.
 *
 * Anything else — an unrecognised constraint, an unrelated Prisma code, a
 * plain `Error` — is returned UNCHANGED rather than guessed at.
 *
 * Exported for its own unit spec: the `carrier_warehouse_pkey` case cannot be
 * produced through `add` (the adapter never writes `id`; the DB defaults it),
 * and an un-producible case is exactly the one the old catch-all got wrong.
 */
export function translateAddConstraintError(
  err: unknown,
  carrierId: string,
  warehouseId: string,
): unknown {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) {
    return err;
  }

  if (
    err.code === 'P2002' &&
    // Two shapes, both real: a P2002 raised through the query engine reports
    // `meta.target` as the FIELD LIST (`['carrier_id','warehouse_id']`,
    // observed in this spec's own duplicate-pair test), while the driver
    // adapter reports the INDEX NAME. Either identifies the coverage
    // constraint; neither matches `carrier_warehouse_pkey`.
    (violatedConstraintIs(err, COVERAGE_UNIQUE_INDEX) ||
      violatedConstraintCovers(err, COVERAGE_UNIQUE_FIELDS))
  ) {
    return new CoverageAlreadyDeclaredError(carrierId, warehouseId);
  }
  if (err.code === 'P2003') {
    if (violatedConstraintIs(err, COVERAGE_WAREHOUSE_FK)) {
      return new CoverageWarehouseNotFoundError(warehouseId);
    }
    if (violatedConstraintIs(err, COVERAGE_CARRIER_FK)) {
      return new CarrierNotFoundError(carrierId);
    }
  }
  return err;
}

/**
 * Prisma adapter for `ICarrierWarehouseRepository`. `add` lets
 * `@@unique([carrierId, warehouseId])` and both FKs do the enforcement, and
 * translates their violations into named domain errors
 * (`translateAddConstraintError`) instead of leaking raw Prisma codes.
 * `remove` is a `deleteMany`, which is naturally a no-op (0 rows affected, no
 * error) when the pair does not exist.
 *
 * Client source: `TenantContextService.getClient()` (design.md D2/D5) —
 * resolved fresh per call, never cached on `this`.
 */
@Injectable()
export class PrismaCarrierWarehouseRepository implements ICarrierWarehouseRepository {
  constructor(private readonly tenantContext: TenantContextService) {}

  async add(input: CreateCarrierWarehouseInput): Promise<DomainCarrierWarehouse> {
    // Through the domain factory, not straight from `input` — same reason as
    // `PrismaCarrierRepository.create`: whatever defaulting the coverage row
    // has belongs to `createCarrierWarehouse`, in one place. `id`/`createdAt`
    // stay DB-owned (`@default`), so the minted ones are not written.
    const pair = createCarrierWarehouse(input);
    try {
      const row = await this.tenantContext.getClient().carrierWarehouse.create({
        data: {
          carrierId: pair.carrierId,
          warehouseId: pair.warehouseId,
        },
      });
      return toDomain(row);
    } catch (err) {
      throw translateAddConstraintError(err, pair.carrierId, pair.warehouseId);
    }
  }

  async remove(carrierId: string, warehouseId: string): Promise<void> {
    await this.tenantContext.getClient().carrierWarehouse.deleteMany({
      where: { carrierId, warehouseId },
    });
  }

  async listByCarrier(carrierId: string): Promise<DomainCarrierWarehouse[]> {
    const rows = await this.tenantContext.getClient().carrierWarehouse.findMany({
      where: { carrierId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toDomain);
  }

  /** Served by `carrier_warehouse_warehouse_id_idx`, which exists for exactly this access path. */
  async listByWarehouse(warehouseId: string): Promise<DomainCarrierWarehouse[]> {
    const rows = await this.tenantContext.getClient().carrierWarehouse.findMany({
      where: { warehouseId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toDomain);
  }
}
