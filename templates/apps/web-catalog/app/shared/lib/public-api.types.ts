/**
 * Wire types for `api-public`'s public HTTP contract (design.md §3). Owned
 * by `web-catalog`, not imported cross-app — apps depend on the CONTRACT,
 * verified by `api-public`'s own DTO contract test, not on each other's
 * source.
 */

/** `amount` is a decimal STRING, never a JSON number (design.md §3). */
export interface PublicMoneyDto {
  readonly amount: string;
  readonly currency: string;
}

/**
 * `percentDiscountPrice`/`discountPrice` are decimal STRINGS, never JSON
 * numbers — `Number(...)` them only for display/comparison, never further
 * arithmetic. `order` is the only JSON number in this DTO.
 */
export interface PublicProductDto {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly categoryId: string;
  readonly categorySlug: string;
  readonly price: PublicMoneyDto;
  readonly finalPrice: PublicMoneyDto;
  readonly percentDiscountPrice: string;
  readonly discountPrice: string;
  readonly isOffer: boolean;
  readonly isNew: boolean;
  readonly imageUrl: string;
  readonly order: number;
}

export interface PublicProductListResponseDto {
  readonly items: PublicProductDto[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly pageCount: number;
}

export interface PublicCategoryDto {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly image: string | null;
  readonly order: number;
}
