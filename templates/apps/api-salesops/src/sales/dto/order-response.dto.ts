import type { MoneyAmountDto } from './money-amount.dto.js';

/** Response shape for a single `OrderLine` inside `OrderResponseDto`. */
export class OrderLineResponseDto {
  id!: string;
  productId!: string;
  productName!: string;
  categoryName!: string;
  price!: MoneyAmountDto;
  percentDiscountPrice!: string;
  discountPrice!: string;
  quantity!: number;
  unitFinalPrice!: MoneyAmountDto;
  lineTotalNative!: MoneyAmountDto;
  rateApplied!: string;
  rateEffectiveFrom!: string;
  /** In `Order.currency`, not `price.currency`. */
  lineTotalOrder!: string;
}

/** Response shape for a single `OrderPayment` inside `OrderResponseDto`. */
export class OrderPaymentResponseDto {
  id!: string;
  channel!: string;
  amount!: MoneyAmountDto;
  rateApplied!: string;
  rateEffectiveFrom!: string;
  /** In `Order.currency`. */
  amountInOrderCurrency!: string;
}

/** Response shape for the optional `SaleCredit` inside `OrderResponseDto`. */
export class SaleCreditResponseDto {
  id!: string;
  orderId!: string;
  customerId!: string;
  /** In `Order.currency`. */
  total!: string;
  /** In `Order.currency`. */
  paid!: string;
  rateApplied!: string;
  rateEffectiveFrom!: string;
  createdAt!: string;
  updatedAt!: string;
}

/**
 * Response shape for every Order CRUD/action endpoint. `subtotal`/
 * `discountTotal`/`total` are decimal strings in `Order.currency` (a single
 * currency per order, so no `MoneyAmountDto` pair is needed at this level —
 * only per-line/per-payment native amounts need the amount+currency shape).
 * Dates are always ISO strings; `verifiedAt`/`deliveredAt` are `null` until
 * the matching transition happens.
 */
export class OrderResponseDto {
  id!: string;
  customerId!: string;
  customerName!: string;
  warehouseId!: string;
  deliveryMode!: string;
  /** Spanish, UI-facing display label for `deliveryMode` (`OrderLabelHelpers.getDeliveryModeLabel`). */
  deliveryModeLabel!: string;
  currency!: string;
  status!: string;
  /** Spanish, UI-facing display label for `status` (`OrderLabelHelpers.getOrderStatusLabel`). */
  statusLabel!: string;
  subtotal!: string;
  discountTotal!: string;
  total!: string;
  lines!: OrderLineResponseDto[];
  payments!: OrderPaymentResponseDto[];
  saleCredit!: SaleCreditResponseDto | null;
  /**
   * `CompanyUser.id` of the agent credited with the sale. `null` only for
   * orders predating attribution. Exposed on the READ side (never accepted on
   * the write side) because supervisors need to see who sold what, and because
   * agent-scoped reads are filtered on exactly this value.
   */
  attributedCompanyUserId!: string | null;
  orderDate!: string;
  verifiedAt!: string | null;
  deliveredAt!: string | null;
  createdAt!: string;
  updatedAt!: string;
}
