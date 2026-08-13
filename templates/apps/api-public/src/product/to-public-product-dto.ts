import {
  discountPriceToDecimalString,
  isOffer,
  moneyToDecimalString,
  percentToDecimalString,
} from '@store-mgmt/domain';
import { assemblePublicImageUrl } from './image-url.js';
import type { PublicProductListItem } from './public-product.service.js';
import type { PublicProductDto } from './dto/index.js';

/** The ONE place a domain `Product` (+ its precomputed `finalPrice`) becomes the public wire shape (design.md §3). */
export function toPublicProductDto(item: PublicProductListItem, categorySlug: string): PublicProductDto {
  const { product, finalPrice } = item;
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    categoryId: product.categoryId,
    categorySlug,
    price: { amount: moneyToDecimalString(product.price), currency: product.price.currency },
    finalPrice: { amount: moneyToDecimalString(finalPrice), currency: finalPrice.currency },
    percentDiscountPrice: percentToDecimalString(product.percentDiscountPrice),
    discountPrice: discountPriceToDecimalString(product.discountPrice),
    isOffer: isOffer(product),
    isNew: product.isNew,
    imageUrl: product.image === null ? null : assemblePublicImageUrl(product.id, product.image),
    order: product.order,
  };
}
