import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  ICategoryRepository,
  IProductRepository,
  Money,
  Product as DomainProduct,
} from '@store-mgmt/domain';
import { CATEGORY_REPOSITORY, PRODUCT_REPOSITORY, finalPrice } from '@store-mgmt/domain';

export type PublicProductSort = 'destacado' | 'precio-asc' | 'precio-desc' | 'nombre';

export interface PublicProductListQuery {
  readonly categorySlug?: string;
  readonly search?: string;
  readonly sort: PublicProductSort;
  readonly page: number;
  readonly pageSize: number;
}

export interface PublicProductListItem {
  readonly product: DomainProduct;
  readonly finalPrice: Money;
}

export interface PublicProductListResult {
  readonly items: PublicProductListItem[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly pageCount: number;
}

/**
 * `nombre` sort locale (design.md D5: "sorts with localeCompare against the
 * store's locale"). `api-public` has no access to `web-catalog`'s per-store
 * `StoreConfig.locale` (design D9) in this phase — that wiring does not
 * exist until Phase 5. Every route/query-param name in this app is
 * Spanish-first (`/public/products?categoria=&orden=`), so `es` is a
 * documented simplification here, not a silent one; multi-locale stores are
 * out of this phase's scope.
 */
const NAME_SORT_LOCALE = 'es';

/** D5: the tripwire — a WARN when a single query materializes more than this many rows before sort/paginate. */
const MATERIALIZED_ROWS_WARN_THRESHOLD = 2000;

function compareBigint(a: bigint, b: bigint): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * D5's pipeline: filters server-side (`active: true` ALWAYS — never
 * `includeInactive`, spec: public-catalog "includeInactive param is
 * ignored" — plus category and search, via `IProductRepository.list`),
 * computes `finalPrice` per row from `packages/domain`'s pure pricing
 * (never SQL, never re-derived elsewhere), sorts the FULL filtered set in
 * memory, THEN slices the page.
 */
@Injectable()
export class PublicProductService {
  private readonly logger = new Logger(PublicProductService.name);

  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly productRepository: IProductRepository,
    @Inject(CATEGORY_REPOSITORY) private readonly categoryRepository: ICategoryRepository,
  ) {}

  async list(query: PublicProductListQuery): Promise<PublicProductListResult> {
    let categoryId: string | undefined;
    if (query.categorySlug) {
      const category = await this.categoryRepository.findBySlug(query.categorySlug);
      if (!category) {
        // An unknown category slug is an EMPTY page, never a 404 (design.md
        // §3) — and never a wasted/misleading product query either.
        return this.emptyResult(query.page, query.pageSize);
      }
      categoryId = category.id;
    }

    const products = await this.productRepository.list({
      categoryId,
      search: query.search,
      // `includeInactive` intentionally omitted — defaults to excluding
      // `active: false` rows, and this caller has no parameter that could
      // ever set it to `true`.
    });

    if (products.length > MATERIALIZED_ROWS_WARN_THRESHOLD) {
      this.logger.warn(
        `Materialized ${products.length} products for one public list query (threshold ${MATERIALIZED_ROWS_WARN_THRESHOLD})`,
      );
    }

    const withFinalPrice: PublicProductListItem[] = products.map((product) => ({
      product,
      finalPrice: finalPrice(product),
    }));

    const sorted = this.sort(withFinalPrice, query.sort);

    const total = sorted.length;
    const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
    const offset = (query.page - 1) * query.pageSize;
    const items = sorted.slice(offset, offset + query.pageSize);

    return { items, page: query.page, pageSize: query.pageSize, total, pageCount };
  }

  /** Active-only single-product lookup for `GET /public/products/:id` (4.8) — inactive or missing is `null`, never thrown. */
  async findActiveById(id: string): Promise<PublicProductListItem | null> {
    const product = await this.productRepository.findById(id);
    if (!product || !product.active) {
      return null;
    }
    return { product, finalPrice: finalPrice(product) };
  }

  private sort(items: PublicProductListItem[], sort: PublicProductSort): PublicProductListItem[] {
    const copy = [...items];
    switch (sort) {
      case 'precio-asc':
        return copy.sort((a, b) => compareBigint(a.finalPrice.minorUnits, b.finalPrice.minorUnits));
      case 'precio-desc':
        return copy.sort((a, b) => compareBigint(b.finalPrice.minorUnits, a.finalPrice.minorUnits));
      case 'nombre':
        return copy.sort((a, b) => a.product.name.localeCompare(b.product.name, NAME_SORT_LOCALE));
      case 'destacado':
      default:
        return copy.sort((a, b) => a.product.order - b.product.order);
    }
  }

  private emptyResult(page: number, pageSize: number): PublicProductListResult {
    return { items: [], page, pageSize, total: 0, pageCount: 1 };
  }
}
