import { Inject, Injectable } from '@nestjs/common';
import type {
  CommissionAccrual,
  CommissionPayment,
  ICommissionAccrualRepository,
  ICommissionPaymentRepository,
  Money,
} from '@store-mgmt/domain';
import {
  COMMISSION_ACCRUAL_REPOSITORY,
  COMMISSION_PAYMENT_REPOSITORY,
  CommissionAlreadySettledError,
  money,
  moneyToDecimalString,
} from '@store-mgmt/domain';
import type {
  CommissionAccrualResponseDto,
  CommissionMoneyDto,
  CommissionPaymentResponseDto,
  CommissionReportRowDto,
  RecordCommissionPaymentDto,
} from './dto/index.js';

function toMoneyDto(amount: Money): CommissionMoneyDto {
  return { amount: moneyToDecimalString(amount), currency: amount.currency };
}

/**
 * Reads accruals and records settlement.
 *
 * Note what this service CANNOT do: it never creates an accrual (that is the
 * recorder's job, triggered by delivery) and it never touches an order. The
 * only write here is a payment, and the amount for it comes from the accrual's
 * frozen total — never from the request.
 */
@Injectable()
export class CommissionService {
  constructor(
    @Inject(COMMISSION_ACCRUAL_REPOSITORY)
    private readonly accrualRepository: ICommissionAccrualRepository,
    @Inject(COMMISSION_PAYMENT_REPOSITORY)
    private readonly paymentRepository: ICommissionPaymentRepository,
  ) {}

  /** `scopedToCompanyUserId` is how a `sales_agent` is limited to their own earnings. */
  async listAccruals(scopedToCompanyUserId?: string): Promise<CommissionAccrualResponseDto[]> {
    const accruals = await this.accrualRepository.list(
      scopedToCompanyUserId ? { attributedCompanyUserId: scopedToCompanyUserId } : undefined,
    );
    const payments = await this.paymentRepository.listByAccrualIds(accruals.map((a) => a.id));
    const settledIds = new Set(payments.map((p) => p.accrualId));
    return accruals.map((accrual) => this.toAccrualResponse(accrual, settledIds.has(accrual.id)));
  }

  async recordPayment(
    dto: RecordCommissionPaymentDto,
    recordedByCompanyUserId: string,
  ): Promise<CommissionPaymentResponseDto> {
    const accrual = await this.accrualRepository.findById(dto.accrualId);
    if (!accrual) {
      return Promise.reject(new AccrualNotFoundError(`Accrual "${dto.accrualId}" not found`));
    }

    // Checked here for a clear error message, but the unique index is what
    // actually guarantees it — this read-then-write loses to a concurrent
    // second request, and the DB constraint is what stops that one.
    const existing = await this.paymentRepository.findByAccrualId(accrual.id);
    if (existing) {
      throw new CommissionAlreadySettledError(
        `Accrual "${accrual.id}" was already settled on ${existing.paidAt.toISOString()}`,
      );
    }

    try {
      const payment = await this.paymentRepository.create({
        // The AMOUNT comes from the accrual, never from the body. What is owed
        // was decided at delivery; a payer naming their own figure here would
        // make the frozen total decorative.
        accrualId: accrual.id,
        amountMinorUnits: accrual.total.minorUnits,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
        recordedByCompanyUserId,
        note: dto.note ?? null,
      });
      return this.toPaymentResponse(payment);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new CommissionAlreadySettledError(
          `Accrual "${accrual.id}" was settled concurrently by another request`,
        );
      }
      throw err;
    }
  }

  /**
   * Totals per agent. An `owner` who registered and delivered a sale appears
   * here like anyone else — earning a commission is about having made the
   * sale, not about which role bit the seller holds. Filtering them out would
   * silently withhold money somebody earned.
   */
  async report(scopedToCompanyUserId?: string): Promise<CommissionReportRowDto[]> {
    const accruals = await this.accrualRepository.list(
      scopedToCompanyUserId ? { attributedCompanyUserId: scopedToCompanyUserId } : undefined,
    );
    const payments = await this.paymentRepository.listByAccrualIds(accruals.map((a) => a.id));
    const paidByAccrual = new Map(payments.map((p) => [p.accrualId, p.amount]));

    const rows = new Map<string, { accrued: bigint; paid: bigint; count: number; unresolved: number }>();
    for (const accrual of accruals) {
      const row = rows.get(accrual.attributedCompanyUserId) ?? {
        accrued: 0n,
        paid: 0n,
        count: 0,
        unresolved: 0,
      };
      row.accrued += accrual.total.minorUnits;
      row.paid += paidByAccrual.get(accrual.id)?.minorUnits ?? 0n;
      row.count += 1;
      row.unresolved += accrual.unresolved.length;
      rows.set(accrual.attributedCompanyUserId, row);
    }

    return [...rows.entries()].map(([companyUserId, row]) => ({
      companyUserId,
      accrualCount: row.count,
      totalAccrued: toMoneyDto(money(row.accrued, 'MN')),
      totalPaid: toMoneyDto(money(row.paid, 'MN')),
      totalOutstanding: toMoneyDto(money(row.accrued - row.paid, 'MN')),
      unresolvedLines: row.unresolved,
    }));
  }

  private toAccrualResponse(
    accrual: CommissionAccrual,
    settled: boolean,
  ): CommissionAccrualResponseDto {
    return {
      id: accrual.id,
      orderId: accrual.orderId,
      attributedCompanyUserId: accrual.attributedCompanyUserId,
      total: toMoneyDto(accrual.total),
      lines: accrual.lines.map((line) => ({
        orderLineId: line.orderLineId,
        productId: line.productId,
        quantity: line.quantity,
        unitCommission: toMoneyDto(line.unitCommission),
        lineCommission: toMoneyDto(line.lineCommission),
      })),
      unresolved: accrual.unresolved.map((u) => ({
        orderLineId: u.orderLineId,
        productId: u.productId,
        quantity: u.quantity,
      })),
      settled,
      accruedAt: accrual.accruedAt.toISOString(),
    };
  }

  private toPaymentResponse(payment: CommissionPayment): CommissionPaymentResponseDto {
    return {
      id: payment.id,
      accrualId: payment.accrualId,
      amount: toMoneyDto(payment.amount),
      paidAt: payment.paidAt.toISOString(),
      recordedByCompanyUserId: payment.recordedByCompanyUserId,
      note: payment.note,
    };
  }
}

/** Thrown when a payment names an accrual that does not exist — mapped to 404 at the controller. */
export class AccrualNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccrualNotFoundError';
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';
}
