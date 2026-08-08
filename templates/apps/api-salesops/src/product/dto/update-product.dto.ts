import type { MoneyAmountDto } from './money-amount.dto.js';

/** Request body for `PATCH /products/:id` — every field optional. */
export class UpdateProductDto {
  name?: string;
  description?: string;
  sku?: string;
  barcode?: string;
  price?: MoneyAmountDto;
  percentDiscountPrice?: string;
  discountPrice?: string;
  cost?: MoneyAmountDto;
  categoryId?: string;
  image?: string;
  isNew?: boolean;
  order?: number;
  active?: boolean;
}
