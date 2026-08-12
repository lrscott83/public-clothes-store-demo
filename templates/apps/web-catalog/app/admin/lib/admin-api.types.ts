/** Mirrors `apps/api-salesops`'s `MoneyAmountDto` (`{amount, currency}`, `amount` a decimal string, never a JSON number). */
export interface AdminMoneyDto {
  amount: string;
  currency: string;
}

/** Mirrors `apps/api-salesops`'s `ProductResponseDto` exactly (field-for-field). */
export interface AdminProductDto {
  id: string;
  name: string;
  description: string;
  sku: string | null;
  barcode: string | null;
  price: AdminMoneyDto;
  percentDiscountPrice: string;
  discountPrice: string;
  cost: AdminMoneyDto;
  finalPrice: AdminMoneyDto;
  isOffer: boolean;
  categoryId: string;
  image: string;
  isNew: boolean;
  order: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Mirrors `apps/api-salesops`'s `CreateProductDto` exactly. */
export interface CreateProductInput {
  name: string;
  description: string;
  sku?: string;
  barcode?: string;
  price: AdminMoneyDto;
  percentDiscountPrice?: string;
  discountPrice?: string;
  cost: AdminMoneyDto;
  categoryId: string;
  image: string;
  isNew?: boolean;
  order: number;
  active?: boolean;
}

/** Mirrors `apps/api-salesops`'s `UpdateProductDto` — every field optional. */
export type UpdateProductInput = Partial<CreateProductInput>;

/** Mirrors `apps/api-salesops`'s `CategoryResponseDto` exactly. */
export interface AdminCategoryDto {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  icon: string | null;
  order: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
