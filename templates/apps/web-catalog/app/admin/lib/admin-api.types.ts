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
  image: string | null;
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
  image?: string;
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

/** Mirrors `apps/api-salesops`'s `CreateCategoryDto` exactly. */
export interface CreateCategoryInput {
  name: string;
  slug: string;
  image?: string;
  icon?: string;
  order: number;
  active?: boolean;
}

/** Mirrors `apps/api-salesops`'s `UpdateCategoryDto` — every field optional. */
export type UpdateCategoryInput = Partial<CreateCategoryInput>;

/** Mirrors `apps/api-salesops`'s `ImportRowResult` (`ImportService.importCsv`). */
export interface AdminImportRowResult {
  /** 1-based data-row number (the header is not counted). */
  line: number;
  status: 'created' | 'updated' | 'failed';
  /** The normalized product name when one could be derived, else null. */
  name: string | null;
  /** Spanish failure reason; present only when status is 'failed'. */
  reason?: string;
}

/** Mirrors `apps/api-salesops`'s `ImportReport` (`ImportService.importCsv`). */
export interface AdminImportReport {
  totalRows: number;
  created: number;
  updated: number;
  failed: number;
  rows: AdminImportRowResult[];
}
