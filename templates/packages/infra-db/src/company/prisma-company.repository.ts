import { Injectable } from '@nestjs/common';
import type { Company as DomainCompany, CompanyType, CreateCompanyInput, ICompanyRepository } from '@store-mgmt/domain';
import { DuplicateCompanySlugError } from '@store-mgmt/domain';
import { Prisma } from '../../generated/master/client.js';
import { PrismaMasterService } from '../master-prisma-client.js';

/** Shape shared by every row Prisma returns for the `Company` model. */
interface CompanyRow {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly isActive: boolean;
  readonly schemaName: string | null;
  readonly type: CompanyType | null;
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
    type: row.type,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * True when `err` is a Prisma unique-constraint violation (P2002) on
 * `target`. Mirrors `PrismaUserRepository.isUniqueViolation`/
 * `PrismaCustomerRepository.isUniqueViolation` — the driver-adapter + WASM
 * query compiler architecture surfaces the violated column(s) at
 * `err.meta.driverAdapterError.cause.constraint.fields`, NOT the classic
 * `err.meta.target`; both are checked.
 */
function isUniqueViolation(err: unknown, target: string): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') {
    return false;
  }

  const meta = err.meta as
    | {
        target?: string | string[];
        driverAdapterError?: { cause?: { constraint?: { fields?: string[] } } };
      }
    | undefined;

  if (Array.isArray(meta?.target)) return meta.target.includes(target);
  if (typeof meta?.target === 'string') return meta.target === target;

  const fields = meta?.driverAdapterError?.cause?.constraint?.fields;
  return Array.isArray(fields) && fields.includes(target);
}

/**
 * Prisma adapter for `ICompanyRepository`. `create`/`setSchemaName`/`delete`
 * back the provisioning saga (design.md D7,
 * `apps/api-idp/src/company/create-company.saga.ts`) — the only writer of a
 * `Company` row. `create` translates the P2002 unique violation on `slug` to
 * the domain `DuplicateCompanySlugError` — no application-level pre-check,
 * the unique index is the single source of truth (mirrors
 * `PrismaUserRepository`'s `login` handling).
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

  async findBySlug(slug: string): Promise<DomainCompany | null> {
    const row = await this.prisma.company.findUnique({ where: { slug } });
    return row ? toDomain(row) : null;
  }

  async create(input: CreateCompanyInput): Promise<DomainCompany> {
    try {
      const row = await this.prisma.company.create({
        data: { name: input.name, slug: input.slug },
      });
      return toDomain(row);
    } catch (err) {
      if (isUniqueViolation(err, 'slug')) {
        throw new DuplicateCompanySlugError(`slug "${input.slug}" is already in use`);
      }
      throw err;
    }
  }

  async setSchemaName(id: string, schemaName: string | null): Promise<DomainCompany> {
    const row = await this.prisma.company.update({ where: { id }, data: { schemaName } });
    return toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.company.delete({ where: { id } });
  }
}
