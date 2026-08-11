import type { PublicMoneyDto } from './public-money.dto.js';

/**
 * design.md §3's exact wire shape. Absent BY CONSTRUCTION, not by deletion
 * in a mapper: `cost`, `sku`, `barcode`, `active`, `createdAt`, `updatedAt`
 * — none of these fields exist on this type, so a mapper cannot
 * accidentally copy them through. `percentDiscountPrice`/`discountPrice`
 * and both `PublicMoneyDto.amount`s are decimal strings, never JSON
 * numbers. `order` is the only JSON number in this DTO.
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

/** `GET /public/products`'s paginated envelope (design.md §3). */
export interface PublicProductListResponseDto {
  readonly items: PublicProductDto[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly pageCount: number;
}
