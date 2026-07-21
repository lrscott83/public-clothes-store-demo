import type { MoneyAmountDto } from './money-amount.dto.js';

/**
 * Response shape for every Product CRUD endpoint. `price`/`cost`/derived
 * `finalPrice` are `MoneyAmountDto` (`{ amount, currency }`); `finalPrice`'s
 * currency is `price`'s. `percentDiscountPrice`/`discountPrice` are decimal
 * strings, never numbers. `finalPrice` and `isOffer` are DERIVED at read
 * time (never stored) via the domain's pure `pricing.ts` and included on
 * every read response.
 */
export class ProductResponseDto {
  id!: string;
  name!: string;
  description!: string;
  sku!: string | null;
  barcode!: string | null;
  price!: MoneyAmountDto;
  percentDiscountPrice!: string;
  discountPrice!: string;
  cost!: MoneyAmountDto;
  finalPrice!: MoneyAmountDto;
  isOffer!: boolean;
  categoryId!: string;
  image!: string;
  isNew!: boolean;
  order!: number;
  active!: boolean;
  createdAt!: string;
  updatedAt!: string;
}
