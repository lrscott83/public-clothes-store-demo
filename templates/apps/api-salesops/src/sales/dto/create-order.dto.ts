import type { MoneyAmountDto } from './money-amount.dto.js';

/**
 * A single line item inside `POST /orders`. WHAT to sell and HOW MANY — and
 * deliberately nothing else.
 *
 * `productName`, `categoryName`, `price`, `percentDiscountPrice` and
 * `discountPrice` are NEVER accepted from the client: they are resolved from
 * the catalog at creation time and frozen onto the line. Accepting a price
 * here would let the caller name its own price for a real product, and that
 * number flows into the line total, the order total, the payment sum and the
 * credit balance. "Snapshot" means a copy of the catalog, frozen at sale
 * time — not a copy of the request.
 *
 * Same reasoning the spec already applies to `total` and `currency`:
 * derived, never accepted as input.
 */
export class CreateOrderLineDto {
  productId!: string;
  quantity!: number;
}

/**
 * A single split-payment entry inside `POST /orders`. `amount` is in the
 * channel's fixed settlement currency (`CHANNEL_CURRENCY[channel]`),
 * validated by the domain factory (`buildOrderPayment`).
 */
export class CreateOrderPaymentDto {
  channel!: string;
  amount!: MoneyAmountDto;
}

/**
 * Request body for `POST /orders`. `deliveryMode` is REQUIRED
 * (`"pickup"|"delivery"`). `total`/`currency` are NEVER accepted from the
 * client — both are DERIVED by the domain factory `createOrder()` from
 * `lines` (spec: "Totals are derived, not accepted as input"; "currency is
 * DERIVED, never selected"). `customerName` is likewise NOT accepted: it is
 * snapshot from the `Customer` record, so the stored name is the one the
 * system knows, not one the caller typed. `payments` defaults to an empty
 * split when omitted.
 */
export class CreateOrderDto {
  customerId!: string;
  warehouseId!: string;
  deliveryMode!: string;
  lines!: CreateOrderLineDto[];
  payments?: CreateOrderPaymentDto[];
}
