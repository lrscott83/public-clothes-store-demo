import { Injectable } from '@nestjs/common';
import type { Company as DomainCompany, ICompanyRepository } from '@store-mgmt/domain';
import { PrismaMasterService } from '../master-prisma-client.js';

/** Shape shared by every row Prisma returns for the `Company` model. */
interface CompanyRow {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly isActive: boolean;
  readonly schemaName: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function toDomain(row: CompanyRow): DomainCompany {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    isActive: row.isActive,
    schemaName: row.schemaName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Prisma adapter for `ICompanyRepository`. Read-only by design — nothing in
 * this slice creates a `Company` through application code; the single row is
 * seeded by migration 001 + `infra-db/src/company/seed.ts`. `list()` is the
 * input to `resolveSoleCompany` at signup time (Phase 2 cutover).
 */
@Injectable()
export class PrismaCompanyRepository implements ICompanyRepository {
  constructor(private readonly prisma: PrismaMasterService) {}

  async list(): Promise<DomainCompany[]> {
    const rows = await this.prisma.company.findMany({ orderBy: { name: 'asc' } });
    return rows.map(toDomain);
  }

  async findById(id: string): Promise<DomainCompany | null> {
    const row = await this.prisma.company.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }
}
