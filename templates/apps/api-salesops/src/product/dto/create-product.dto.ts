/**
 * Request body for `POST /products`. Every money/percent field is a
 * `string` — never a JSON number — so decimal fidelity is preserved from
 * the wire through to the domain's `bigint`/`Money` minor units (mirrors
 * `CreateRateDto`).
 */
export class CreateProductDto {
  name!: string;
  description!: string;
  sku?: string;
  barcode?: string;
  price!: string;
  percentDiscountPrice?: string;
  discountPrice?: string;
  costoUSD!: string;
  categoryId!: string;
  image!: string;
  isNew?: boolean;
  order!: number;
  active?: boolean;
}
