import { Injectable } from '@nestjs/common';
import type {
  CommissionAccrual,
  CommissionAccrualFilter,
  ICommissionAccrualRepository,
} from '@store-mgmt/domain';
import { moneyFromDecimalString, moneyToDecimalString } from '@store-mgmt/domain';
import { TenantDefaultPrismaService } from '../tenant/tenant-default-prisma.service.js';

/** Shape of a `commission_accrual` row with its children included. */
interface AccrualRow {
  readonly id: string;
  readonly orderId: string;
  readonly attributedCompanyUserId: string;
  readonly total: { toString(): string };
  readonly accruedAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lines: readonly {
    readonly id: string;
    readonly orderLineId: string;
    readonly productId: string;
    readonly quantity: number;
    readonly unitCommission: { toString(): string };
    readonly lineCommission: { toString(): string };
  }[];
  readonly unresolved: readonly {
    readonly orderLineId: string;
    readonly productId: string;
    readonly quantity: number;
  }[];
}

/** Every amount in this module is MN — see the domain module for why there is no other currency here. */
function toDomain(row: AccrualRow): CommissionAccrual {
  return {
    id: row.id,
    orderId: row.orderId,
    attributedCompanyUserId: row.attributedCompanyUserId,
    total: moneyFromDecimalString(row.total.toString(), 'MN'),
    lines: row.lines.map((line) => ({
      id: line.id,
      orderLineId: line.orderLineId,
      productId: line.productId,
      quantity: line.quantity,
      unitCommission: moneyFromDecimalString(line.unitCommission.toString(), 'MN'),
      lineCommission: moneyFromDecimalString(line.lineCommission.toString(), 'MN'),
    })),
    unresolved: row.unresolved.map((u) => ({
      orderLineId: u.orderLineId,
      productId: u.productId,
      quantity: u.quantity,
    })),
    accruedAt: row.accruedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const WITH_CHILDREN = { lines: true, unresolved: true } as const;

/**
 * Prisma adapter for `ICommissionAccrualRepository`.
 *
 * `create` is create-if-absent, not upsert. The difference is the whole point:
 * an accrual freezes what an agent earned at a moment in time, so a second
 * delivery of the same order must return the ORIGINAL row untouched rather
 * than restate it against a possibly-edited commission table. The uniqueness
 * of `order_id` is what makes that safe under concurrency — two racing writers
 * cannot both insert, and the loser reads back the winner's row.
 */
@Injectable()
export class PrismaCommissionAccrualRepository implements ICommissionAccrualRepository {
  constructor(private readonly prisma: TenantDefaultPrismaService) {}

  async create(accrual: CommissionAccrual): Promise<CommissionAccrual> {
    const existing = await this.findByOrderId(accrual.orderId);
    if (existing) {
      return existing;
    }

    try {
      const row = await this.prisma.commissionAccrual.create({
        data: {
          orderId: accrual.orderId,
          attributedCompanyUserId: accrual.attributedCompanyUserId,
          total: moneyToDecimalString(accrual.total),
          accruedAt: accrual.accruedAt,
          lines: {
            create: accrual.lines.map((line) => ({
              orderLineId: line.orderLineId,
              productId: line.productId,
              quantity: line.quantity,
              unitCommission: moneyToDecimalString(line.unitCommission),
              lineCommission: moneyToDecimalString(line.lineCommission),
            })),
          },
          unresolved: {
            create: accrual.unresolved.map((u) => ({
              orderLineId: u.orderLineId,
              productId: u.productId,
              quantity: u.quantity,
            })),
          },
        },
        include: WITH_CHILDREN,
      });
      return toDomain(row);
    } catch (err) {
      // Lost the race against a concurrent delivery of the same order. The
      // winner's accrual is the real one; returning it is the idempotent
      // answer, and re-throwing would turn a handled collision into a 500.
      if (isUniqueViolation(err)) {
        const winner = await this.findByOrderId(accrual.orderId);
        if (winner) {
          return winner;
        }
      }
      throw err;
    }
  }

  async findByOrderId(orderId: string): Promise<CommissionAccrual | null> {
    const row = await this.prisma.commissionAccrual.findUnique({
      where: { orderId },
      include: WITH_CHILDREN,
    });
    return row ? toDomain(row) : null;
  }

  async findById(id: string): Promise<CommissionAccrual | null> {
    const row = await this.prisma.commissionAccrual.findUnique({
      where: { id },
      include: WITH_CHILDREN,
    });
    return row ? toDomain(row) : null;
  }

  async list(filter?: CommissionAccrualFilter): Promise<CommissionAccrual[]> {
    const rows = await this.prisma.commissionAccrual.findMany({
      where: {
        ...(filter?.attributedCompanyUserId
          ? { attributedCompanyUserId: filter.attributedCompanyUserId }
          : {}),
        ...(filter?.unsettledOnly === true ? { payment: { is: null } } : {}),
        ...(filter?.unsettledOnly === false ? { payment: { isNot: null } } : {}),
      },
      include: WITH_CHILDREN,
      orderBy: { accruedAt: 'desc' },
    });
    return rows.map(toDomain);
  }
}

/** Postgres unique-violation, surfaced by Prisma as P2002. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';
}
