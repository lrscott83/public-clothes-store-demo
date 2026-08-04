import { Injectable } from '@nestjs/common';
import type {
  CreateMembershipInput,
  IMembershipRepository,
  Membership as DomainMembership,
  MembershipStatus,
} from '@store-mgmt/domain';
import { PrismaMasterService } from '../master-prisma-client.js';

/** Shape shared by every row Prisma returns for the master `Membership` model. */
interface MembershipRow {
  readonly id: string;
  readonly userId: string;
  readonly companyId: string;
  readonly status: MembershipStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function toDomain(row: MembershipRow): DomainMembership {
  return {
    id: row.id,
    userId: row.userId,
    companyId: row.companyId,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Prisma adapter for `IMembershipRepository` (task 3.4, master-side). The
 * SINGLE source of "is this person active in this company" (design D1) —
 * `TenantContextGuard` (Phase 7) reads it before resolving a tenant schema,
 * and the provisioning saga (Phase 10) creates the owner's ACTIVE row.
 */
@Injectable()
export class PrismaMembershipRepository implements IMembershipRepository {
  constructor(private readonly prisma: PrismaMasterService) {}

  async create(input: CreateMembershipInput): Promise<DomainMembership> {
    const row = await this.prisma.membership.create({
      data: {
        userId: input.userId,
        companyId: input.companyId,
        status: input.status ?? 'ACTIVE',
      },
    });
    return toDomain(row);
  }

  async findByUserAndCompany(userId: string, companyId: string): Promise<DomainMembership | null> {
    const row = await this.prisma.membership.findUnique({
      where: { userId_companyId: { userId, companyId } },
    });
    return row ? toDomain(row) : null;
  }

  async listActiveByUserId(userId: string): Promise<DomainMembership[]> {
    const rows = await this.prisma.membership.findMany({ where: { userId, status: 'ACTIVE' } });
    return rows.map(toDomain);
  }

  async listByCompany(companyId: string): Promise<DomainMembership[]> {
    const rows = await this.prisma.membership.findMany({ where: { companyId } });
    return rows.map(toDomain);
  }
}
