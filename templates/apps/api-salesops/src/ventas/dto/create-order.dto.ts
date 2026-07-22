import type { MoneyAmountDto } from './money-amount.dto.js';

/**
 * A single line item inside `POST /orders`. `price` is the product's
 * NATIVE-currency snapshot at sale time; `productName`/`categoryName` are
 * client-supplied strings frozen onto the line, never re-fetched by id
 * (mirrors the frozen-price-snapshot design). `percentDiscountPrice`/
 * `discountPrice` are decimal strings, never JSON numbers (mirrors
 * `CreateProductDto`).
 */
export class CreateOrderLineDto {
  productId!: string;
  productName!: string;
  categoryName!: string;
  price!: MoneyAmountDto;
  percentDiscountPrice?: string;
  discountPrice?: string;
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
 * (`"recogida"|"domicilio"`). `total`/`currency` are NEVER accepted from the
 * client — both are DERIVED by the domain factory `createOrder()` from
 * `lines` (spec: "Totals are derived, not accepted as input"; "currency is
 * DERIVED, never selected"). `payments` defaults to an empty split when
 * omitted.
 */
export class CreateOrderDto {
  customerId!: string;
  customerName!: string;
  warehouseId!: string;
  deliveryMode!: string;
  lines!: CreateOrderLineDto[];
  payments?: CreateOrderPaymentDto[];
}
