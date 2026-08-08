/** Wire shape for an MN amount — decimal string, never a JSON number. */
export interface CommissionMoneyDto {
  amount: string;
  currency: string;
}

export interface CommissionAccrualLineDto {
  orderLineId: string;
  productId: string;
  quantity: number;
  unitCommission: CommissionMoneyDto;
  lineCommission: CommissionMoneyDto;
}

/**
 * A line that earned nothing YET because its product has no configured
 * commission. Carried separately from `lines` and with no amount at all —
 * showing it as `0.00` would read as a settled fact instead of a gap.
 */
export interface CommissionUnresolvedLineDto {
  orderLineId: string;
  productId: string;
  quantity: number;
}

export interface CommissionAccrualResponseDto {
  id: string;
  orderId: string;
  attributedCompanyUserId: string;
  total: CommissionMoneyDto;
  lines: CommissionAccrualLineDto[];
  unresolved: CommissionUnresolvedLineDto[];
  settled: boolean;
  accruedAt: string;
}

/**
 * Body for `POST /commissions/payments`. Deliberately declares NO `amount`:
 * what is owed is the accrual's frozen total, and accepting a figure from the
 * caller would let the payer name their own number.
 */
export class RecordCommissionPaymentDto {
  accrualId!: string;
  paidAt?: string;
  note?: string | null;
}

export interface CommissionPaymentResponseDto {
  id: string;
  accrualId: string;
  amount: CommissionMoneyDto;
  paidAt: string;
  recordedByCompanyUserId: string;
  note: string | null;
}

/** One agent's totals. `unresolvedLines` is surfaced so a gap in configuration is visible in the report itself. */
export interface CommissionReportRowDto {
  companyUserId: string;
  accrualCount: number;
  totalAccrued: CommissionMoneyDto;
  totalPaid: CommissionMoneyDto;
  totalOutstanding: CommissionMoneyDto;
  unresolvedLines: number;
}
