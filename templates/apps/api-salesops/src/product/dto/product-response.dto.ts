/**
 * Response shape for every Product CRUD endpoint. `price`/`discountPrice`/
 * `costoUSD`/`percentDiscountPrice` are decimal strings, never numbers.
 * `finalPrice` and `isOffer` are DERIVED at read time (never stored) via
 * the domain's pure `pricing.ts` and included on every read response.
 */
export class ProductResponseDto {
  id!: string;
  name!: string;
  description!: string;
  sku!: string | null;
  barcode!: string | null;
  price!: string;
  percentDiscountPrice!: string;
  discountPrice!: string;
  costoUSD!: string;
  finalPrice!: string;
  isOffer!: boolean;
  categoryId!: string;
  image!: string;
  isNew!: boolean;
  order!: number;
  active!: boolean;
  createdAt!: string;
  updatedAt!: string;
}
