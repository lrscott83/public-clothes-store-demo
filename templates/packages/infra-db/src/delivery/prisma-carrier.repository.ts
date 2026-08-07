import { Injectable } from '@nestjs/common';
import type {
  Carrier as DomainCarrier,
  CarrierListFilter,
  CarrierUpdateInput,
  CreateCarrierInput,
  ICarrierRepository,
} from '@store-mgmt/domain';
import {
  CarrierHasOpenAssignmentsError,
  CarrierNotFoundError,
  createCarrier,
  normalizeCarrierPatch,
} from '@store-mgmt/domain';
import { Prisma } from '../../generated/tenant/client.js';
import { LOCK_TRANSACTION_BUDGET } from '../lock-budget.js';
import { withTransactionErrorMapping } from '../transaction-errors.js';
import { TenantContextService } from '../tenant/tenant-context.service.js';

/** Shape of every row Prisma returns for the `Carrier` model. */
interface CarrierRow {
  readonly id: string;
  readonly name: string;
  readonly phone: string | null;
  readonly active: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function toDomain(row: CarrierRow): DomainCarrier {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Translates the Prisma codes a `carrier.update` can raise into named domain
 * errors. P2025 (record not found) is the only one reachable here — `name`
 * and `phone` carry no UNIQUE index and the row has no outbound FK — and,
 * uncaught, it answered `PATCH`/`DELETE /delivery/carriers/<unknown-uuid>`
 * with a 500 while the sibling `GET` answered a clean 404. P2007 (invalid
 * value for a `@db.Uuid` column) is rejected earlier, at the HTTP boundary
 * (`assertUuid`), so it never reaches this adapter.
 */
function translateCarrierWriteError(err: unknown, id: string): unknown {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    return new CarrierNotFoundError(id);
  }
  return err;
}

/**
 * Prisma adapter for `ICarrierRepository`. `create()` runs the input through
 * the domain factory `createCarrier` (single home for the `phone`/`active`
 * defaults AND for their trimming) but never passes `id` through to Prisma —
 * the DB always generates it (`@default(uuid())`), mirroring
 * `PrismaWarehouseRepository`. `softDelete` flips `active`, never a hard
 * `DELETE`.
 *
 * `active` HAS TWO WRITERS — `update` and `softDelete` — and ONE invariant: a
 * carrier holding `in_transit` assignments must not be deactivated (it would
 * drop those in-flight orders out of `getCarrierCapacity`'s `activeOnly`
 * snapshot AND out of `countOrdersAwaitingCarrier`'s anti-join at once,
 * making them invisible and unassignable). Both writers therefore go through
 * `deactivateGuarded`, in ONE place: `PATCH {"active": false}` used to be a
 * one-line bypass of the very guard `CarrierHasOpenAssignmentsError` exists
 * to protect.
 *
 * The guard is enforced HERE and not only in `DeliveryService` because a
 * read-then-write across two statements is not a guard: a concurrent
 * `POST /delivery/assignments` landing between the count and the flip
 * recreates the stranded state. `deactivateGuarded` takes a `FOR UPDATE` row
 * lock on the carrier and counts inside the SAME transaction as the write,
 * and `PrismaDeliveryAssignmentRepository.create` takes that same lock before
 * inserting — so the two serialize and whichever loses sees the other's
 * committed effect.
 *
 * `list`'s `activeOnly` filter: `true` restricts to `active: true` rows;
 * omitted (or `false`) returns every carrier, active or not. This is the
 * standard reading of a boolean named "activeOnly" — the domain port's own
 * doc comment (`carrier-repository.port.ts`) is worded ambiguously enough
 * to admit either reading, and no scenario in `salesops-delivery/spec.md`
 * pins one down, so this adapter fixes the behavior explicitly here rather
 * than guessing silently.
 *
 * Client source: `TenantContextService.getClient()` (design.md D2/D5) —
 * resolved fresh per call, never cached on `this`.
 */
@Injectable()
export class PrismaCarrierRepository implements ICarrierRepository {
  constructor(private readonly tenantContext: TenantContextService) {}

  async create(input: CreateCarrierInput): Promise<DomainCarrier> {
    // Through the domain factory, not a second hand-copied `?? null` / `??
    // true` / `.trim()` here. `createCarrier` is where the Carrier's defaults
    // and field normalization are DEFINED; re-implementing them in this
    // adapter gave them two homes that could drift silently.
    // `id`/`createdAt`/`updatedAt` stay DB-owned (`@default(uuid())`/
    // `@default(now())`/`@updatedAt`), so the factory's minted values for
    // those are deliberately not written — see this class's doc comment.
    const carrier = createCarrier(input);
    const row = await this.tenantContext.getClient().carrier.create({
      data: {
        name: carrier.name,
        phone: carrier.phone,
        active: carrier.active,
      },
    });
    return toDomain(row);
  }

  async update(id: string, patch: CarrierUpdateInput): Promise<DomainCarrier> {
    // Same normalization the factory applies on `create` — the PATCH path
    // never goes through `createCarrier`, so without this `POST` stored a
    // trimmed name and `PATCH` stored a padded one for the same input.
    const normalized = normalizeCarrierPatch(patch);
    const data = {
      ...(normalized.name !== undefined ? { name: normalized.name } : {}),
      ...(normalized.phone !== undefined ? { phone: normalized.phone } : {}),
      ...(normalized.active !== undefined ? { active: normalized.active } : {}),
    };

    // `active: false` IS a deactivation, whichever door it came through.
    if (normalized.active === false) {
      return this.deactivateGuarded(id, data);
    }

    try {
      const row = await this.tenantContext.getClient().carrier.update({ where: { id }, data });
      return toDomain(row);
    } catch (err) {
      throw translateCarrierWriteError(err, id);
    }
  }

  async softDelete(id: string): Promise<void> {
    await this.deactivateGuarded(id, { active: false });
  }

  /**
   * The ONE place `active` is ever set to `false`.
   *
   * Everything happens inside a single transaction: the carrier row is locked
   * `FOR UPDATE` first, the open-assignment count runs against that locked
   * state, and the flip commits with it.
   *
   * WHAT THAT DOES AND DOES NOT GUARANTEE. Against
   * `PrismaDeliveryAssignmentRepository.create` — the only writer that OPENS
   * an assignment — it is exact: `create` takes this same carrier lock before
   * inserting, so the two cannot interleave. Either the assign commits first
   * and this call sees it in the count (409), or this call commits first and
   * the assign sees `active = false` (404).
   *
   * It is NOT exact against the writers that CLOSE an assignment.
   * `closeAssignmentOnDeliveryTx` and `cancelAssignmentOnOrderCancelTx` run
   * inside Sales' order transaction and take no carrier lock at all, so under
   * READ COMMITTED (this database's default, and what the count above reads
   * at) a concurrent delivery or cancellation that has not yet committed is
   * still counted here. The result is a SPURIOUS 409: the guard refuses a
   * deactivation whose last open assignment is in the act of closing. That is
   * the safe direction to be wrong in — the caller retries and it succeeds —
   * but it is a real, reachable outcome and not the airtight invariant this
   * comment used to assert.
   *
   * `data` carries whatever ELSE the caller was patching, so a
   * `PATCH {"name": "x", "active": false}` still applies both — the guard
   * gates the write, it does not narrow it.
   */
  private async deactivateGuarded(
    id: string,
    data: Prisma.CarrierUpdateInput,
  ): Promise<DomainCarrier> {
    return withTransactionErrorMapping('PrismaCarrierRepository.deactivateGuarded', () =>
      this.tenantContext.getClient().$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT "id" FROM "carrier" WHERE "id" = ${id}::uuid FOR UPDATE`,
        );
        if (locked.length === 0) {
          throw new CarrierNotFoundError(id);
        }

        const openAssignments = await tx.deliveryAssignment.count({
          where: { carrierId: id, status: 'in_transit' },
        });
        if (openAssignments > 0) {
          throw new CarrierHasOpenAssignmentsError(id, openAssignments);
        }

        const row = await tx.carrier.update({ where: { id }, data });
        return toDomain(row);
      }, LOCK_TRANSACTION_BUDGET),
    );
  }

  async findById(id: string): Promise<DomainCarrier | null> {
    const row = await this.tenantContext.getClient().carrier.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async list(filter?: CarrierListFilter): Promise<DomainCarrier[]> {
    const rows = await this.tenantContext.getClient().carrier.findMany({
      where: filter?.activeOnly === true ? { active: true } : {},
      orderBy: { name: 'asc' },
    });
    return rows.map(toDomain);
  }
}
