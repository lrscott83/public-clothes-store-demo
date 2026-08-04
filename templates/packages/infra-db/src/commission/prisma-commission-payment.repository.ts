import { Injectable } from '@nestjs/common';
import type {
  CommissionPayment,
  CreateCommissionPaymentInput,
  ICommissionPaymentRepository,
} from '@store-mgmt/domain';
import { moneyFromDecimalString, money, moneyToDecimalString } from '@store-mgmt/domain';
import { TenantContextService } from '../tenant/tenant-context.service.js';

interface PaymentRow {
  readonly id: string;
  readonly accrualId: string;
  readonly amount: { toString(): string };
  readonly paidAt: Date;
  readonly recordedByCompanyUserId: string;
  readonly note: string | null;
  readonly createdAt: Date;
}

function toDomain(row: PaymentRow): CommissionPayment {
  return {
    id: row.id,
    accrualId: row.accrualId,
    amount: moneyFromDecimalString(row.amount.toString(), 'MN'),
    paidAt: row.paidAt,
    recordedByCompanyUserId: row.recordedByCompanyUserId,
    note: row.note,
    createdAt: row.createdAt,
  };
}

/**
 * Prisma adapter for `ICommissionPaymentRepository`.
 *
 * A duplicate `accrualId` is left to surface as the raw uniqueness violation:
 * the service layer maps it to `CommissionAlreadySettledError`. Swallowing it
 * here — returning the existing payment, say — would make double-settlement
 * look successful, and this is the one table where a silent no-op is worse
 * than an error.
 *
 * Client source: `TenantContextService.getClient()` (design.md D2/D5) —
 * resolved fresh per call, never cached on `this` (see
 * `PrismaCurrencyRepository`'s doc comment for why).
 */
@Injectable()
export class PrismaCommissionPaymentRepository implements ICommissionPaymentRepository {
  constructor(private readonly tenantContext: TenantContextService) {}

  async create(input: CreateCommissionPaymentInput): Promise<CommissionPayment> {
    const row = await this.tenantContext.getClient().commissionPayment.create({
      data: {
        accrualId: input.accrualId,
        amount: moneyToDecimalString(money(input.amountMinorUnits, 'MN')),
        paidAt: input.paidAt,
        recordedByCompanyUserId: input.recordedByCompanyUserId,
        note: input.note ?? null,
      },
    });
    return toDomain(row);
  }

  async findByAccrualId(accrualId: string): Promise<CommissionPayment | null> {
    const row = await this.tenantContext.getClient().commissionPayment.findUnique({
      where: { accrualId },
    });
    return row ? toDomain(row) : null;
  }

  async listByAccrualIds(accrualIds: readonly string[]): Promise<CommissionPayment[]> {
    const unique = [...new Set(accrualIds)];
    if (unique.length === 0) {
      return [];
    }
    const rows = await this.tenantContext.getClient().commissionPayment.findMany({
      where: { accrualId: { in: unique } },
    });
    return rows.map(toDomain);
  }
}
