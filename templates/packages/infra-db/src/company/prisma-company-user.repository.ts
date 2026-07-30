import { Injectable } from '@nestjs/common';
import type {
  CompanyUser as DomainCompanyUser,
  CompanyUserStatus,
  CreateCompanyUserInput,
  ICompanyUserRepository,
} from '@store-mgmt/domain';
import type { UserRoleValue } from '@store-mgmt/domain';
import { PrismaService } from '../prisma-client.js';

/** Shape shared by every row Prisma returns for the `CompanyUser` model. */
interface CompanyUserRow {
  readonly id: string;
  readonly userId: string;
  readonly companyId: string;
  readonly role: number;
  readonly status: CompanyUserStatus;
  readonly createdByCompanyUserId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function toDomain(row: CompanyUserRow): DomainCompanyUser {
  return {
    id: row.id,
    userId: row.userId,
    companyId: row.companyId,
    role: row.role,
    status: row.status,
    createdByCompanyUserId: row.createdByCompanyUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Prisma adapter for `ICompanyUserRepository`. `create()` never passes `id`
 * through to Prisma — the DB always generates it (`@default(uuid())`). NO
 * FK to `app_user` — `userId` is a plain column by design (D1); a duplicate
 * `(userId, companyId)` assignment surfaces as the raw Prisma P2002 error
 * (no dedicated domain error was designed for this port — nothing calls
 * `create` yet in this INERT slice; Phase 2's `signup`/`UsersService.create`
 * callers guarantee a fresh user, so the collision path is unreachable in
 * practice today).
 */
@Injectable()
export class PrismaCompanyUserRepository implements ICompanyUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateCompanyUserInput): Promise<DomainCompanyUser> {
    const row = await this.prisma.companyUser.create({
      data: {
        userId: input.userId,
        companyId: input.companyId,
        role: input.role,
        status: input.status ?? 'ACTIVE',
        // Defaults to `null` — signup and seed paths pass nothing, and the
        // column is NEVER backfilled for rows that predate it.
        createdByCompanyUserId: input.createdByCompanyUserId ?? null,
      },
    });
    return toDomain(row);
  }

  async findActiveByUserId(userId: string): Promise<DomainCompanyUser | null> {
    const row = await this.prisma.companyUser.findFirst({ where: { userId, status: 'ACTIVE' } });
    return row ? toDomain(row) : null;
  }

  async findByUserAndCompany(userId: string, companyId: string): Promise<DomainCompanyUser | null> {
    const row = await this.prisma.companyUser.findUnique({
      where: { userId_companyId: { userId, companyId } },
    });
    return row ? toDomain(row) : null;
  }

  async updateRole(userId: string, companyId: string, role: UserRoleValue): Promise<DomainCompanyUser> {
    const row = await this.prisma.companyUser.update({
      where: { userId_companyId: { userId, companyId } },
      data: { role },
    });
    return toDomain(row);
  }

  async listByCompany(companyId: string): Promise<DomainCompanyUser[]> {
    const rows = await this.prisma.companyUser.findMany({ where: { companyId } });
    return rows.map(toDomain);
  }
}
