import { Injectable } from '@nestjs/common';
import type {
  CreateProvisioningIncidentInput,
  IProvisioningIncidentRepository,
  ProvisioningIncident as DomainProvisioningIncident,
} from '@store-mgmt/domain';
import { PrismaMasterService } from '../master-prisma-client.js';

/** Shape shared by every row Prisma returns for the master `ProvisioningIncident` model. */
interface ProvisioningIncidentRow {
  readonly id: string;
  readonly companyId: string;
  readonly step: string;
  readonly reason: string;
  readonly resolvedAt: Date | null;
  readonly createdAt: Date;
}

function toDomain(row: ProvisioningIncidentRow): DomainProvisioningIncident {
  return {
    id: row.id,
    companyId: row.companyId,
    step: row.step,
    reason: row.reason,
    resolvedAt: row.resolvedAt,
    createdAt: row.createdAt,
  };
}

/**
 * Prisma adapter for `IProvisioningIncidentRepository` (task 3.4,
 * master-side). Written by the provisioning saga (Phase 10) when a
 * compensation step itself fails (design D7); read by
 * `scripts/tenant-orphan-sweep.ts` (Phase 10.3) to reconcile.
 */
@Injectable()
export class PrismaProvisioningIncidentRepository implements IProvisioningIncidentRepository {
  constructor(private readonly prisma: PrismaMasterService) {}

  async create(input: CreateProvisioningIncidentInput): Promise<DomainProvisioningIncident> {
    const row = await this.prisma.provisioningIncident.create({
      data: {
        companyId: input.companyId,
        step: input.step,
        reason: input.reason,
        resolvedAt: input.resolvedAt ?? null,
      },
    });
    return toDomain(row);
  }

  async listUnresolved(): Promise<DomainProvisioningIncident[]> {
    const rows = await this.prisma.provisioningIncident.findMany({
      where: { resolvedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toDomain);
  }
}
