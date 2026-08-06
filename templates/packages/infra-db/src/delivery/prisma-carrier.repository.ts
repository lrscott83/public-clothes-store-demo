import { Injectable } from '@nestjs/common';
import type {
  Carrier as DomainCarrier,
  CarrierListFilter,
  CarrierUpdateInput,
  CreateCarrierInput,
  ICarrierRepository,
} from '@store-mgmt/domain';
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
 * Prisma adapter for `ICarrierRepository`. `create()` never passes `id`
 * through to Prisma — the DB always generates it (`@default(uuid())`),
 * mirroring `PrismaWarehouseRepository`. `softDelete` flips `active`, never
 * a hard `DELETE`.
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
    const row = await this.tenantContext.getClient().carrier.create({
      data: {
        name: input.name,
        phone: input.phone ?? null,
        active: input.active ?? true,
      },
    });
    return toDomain(row);
  }

  async update(id: string, patch: CarrierUpdateInput): Promise<DomainCarrier> {
    const row = await this.tenantContext.getClient().carrier.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
      },
    });
    return toDomain(row);
  }

  async softDelete(id: string): Promise<void> {
    await this.tenantContext.getClient().carrier.update({ where: { id }, data: { active: false } });
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
