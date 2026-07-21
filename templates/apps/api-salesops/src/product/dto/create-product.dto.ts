import type { MoneyAmountDto } from './money-amount.dto.js';

/**
 * Request body for `POST /products`. `price`/`cost` are each a
 * `MoneyAmountDto` (`{ amount, currency }`, currency REQUIRED and may differ
 * between the two). `percentDiscountPrice`/`discountPrice` are plain decimal
 * strings — never a JSON number — so decimal fidelity is preserved from the
 * wire through to the domain's `bigint`/`Money` minor units (mirrors
 * `CreateRateDto`).
 */
export class CreateProductDto {
  name!: string;
  description!: string;
  sku?: string;
  barcode?: string;
  price!: MoneyAmountDto;
  percentDiscountPrice?: string;
  discountPrice?: string;
  cost!: MoneyAmountDto;
  categoryId!: string;
  image!: string;
  isNew?: boolean;
  order!: number;
  active?: boolean;
}
