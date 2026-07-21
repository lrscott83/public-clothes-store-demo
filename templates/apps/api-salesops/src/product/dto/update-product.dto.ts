/** Request body for `PATCH /products/:id` — every field optional. */
export class UpdateProductDto {
  name?: string;
  description?: string;
  sku?: string;
  barcode?: string;
  price?: string;
  percentDiscountPrice?: string;
  discountPrice?: string;
  costoUSD?: string;
  categoryId?: string;
  image?: string;
  isNew?: boolean;
  order?: number;
  active?: boolean;
}
