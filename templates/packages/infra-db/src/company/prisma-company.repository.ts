import { Injectable } from '@nestjs/common';
import type { Company as DomainCompany, CreateCompanyInput, ICompanyRepository } from '@store-mgmt/domain';
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
 * Prisma adapter for `ICompanyRepository`. `list()` is the input to
 * `resolveSoleCompany` at signup time. `create`/`setSchemaName`/`delete`
 * back the provisioning saga (design.md D7, `apps/api-idp/src/company/create-company.saga.ts`)
 * — the only writer of a `Company` row.
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

  async create(input: CreateCompanyInput): Promise<DomainCompany> {
    const row = await this.prisma.company.create({
      data: { name: input.name, slug: input.slug },
    });
    return toDomain(row);
  }

  async setSchemaName(id: string, schemaName: string | null): Promise<DomainCompany> {
    const row = await this.prisma.company.update({ where: { id }, data: { schemaName } });
    return toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.company.delete({ where: { id } });
  }
}
