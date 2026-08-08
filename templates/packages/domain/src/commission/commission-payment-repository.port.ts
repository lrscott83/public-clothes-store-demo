import type { CommissionPayment } from './commission-payment.js';

/** Input to `ICommissionPaymentRepository.create` — `id`/`createdAt` are DB-generated. */
export interface CreateCommissionPaymentInput {
  readonly accrualId: string;
  readonly amountMinorUnits: bigint;
  readonly paidAt: Date;
  readonly recordedByCompanyUserId: string;
  readonly note?: string | null;
}

/**
 * Port for recording settlement. A duplicate `accrualId` surfaces as a
 * uniqueness violation from the adapter and is mapped to
 * `CommissionAlreadySettledError` — an accrual is paid once, or not at all.
 */
export interface ICommissionPaymentRepository {
  create(input: CreateCommissionPaymentInput): Promise<CommissionPayment>;
  findByAccrualId(accrualId: string): Promise<CommissionPayment | null>;
  listByAccrualIds(accrualIds: readonly string[]): Promise<CommissionPayment[]>;
}

/** DI token for `ICommissionPaymentRepository` — consumers inject by this symbol. */
export const COMMISSION_PAYMENT_REPOSITORY = Symbol('ICommissionPaymentRepository');
