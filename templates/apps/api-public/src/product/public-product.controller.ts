import { Controller, Get, Inject, NotFoundException, Param, Query, Req, UseGuards } from '@nestjs/common';
import { CATEGORY_REPOSITORY, type ICategoryRepository } from '@store-mgmt/domain';
import { TenantContextService } from '@store-mgmt/infra-db';
import { PublicTenantGuard, type PublicTenantRequest } from '../tenant/public-tenant.guard.js';
import { createRunInTenant } from '../tenant/run-in-tenant.js';
import { parsePublicProductQuery } from './parse-public-product-query.js';
import { PublicProductService } from './public-product.service.js';
import { toPublicProductDto } from './to-public-product-dto.js';
import type { PublicProductDto, PublicProductListResponseDto } from './dto/index.js';

/**
 * `GET /public/products`/`GET /public/products/:id` (design.md §3). No
 * auth anywhere in this app — guarded only by `PublicTenantGuard` (D2).
 * `categorySlug` per item is resolved from a single tenant-wide category
 * list fetched once per list call, not N+1 per product.
 */
@Controller('public/products')
@UseGuards(PublicTenantGuard)
export class PublicProductController {
  private readonly runInTenant: ReturnType<typeof createRunInTenant>;

  constructor(
    private readonly publicProductService: PublicProductService,
    @Inject(CATEGORY_REPOSITORY) private readonly categoryRepository: ICategoryRepository,
    tenantContext: TenantContextService,
  ) {
    this.runInTenant = createRunInTenant(tenantContext);
  }

  @Get()
  async list(
    @Query() rawQuery: Record<string, string | undefined>,
    @Req() req: PublicTenantRequest,
  ): Promise<PublicProductListResponseDto> {
    const parsed = parsePublicProductQuery(rawQuery);

    return this.runInTenant(req.tenant, async () => {
      const result = await this.publicProductService.list({
        categorySlug: parsed.categoria,
        search: parsed.q,
        sort: parsed.orden,
        page: parsed.pagina,
        pageSize: parsed.porPagina,
      });

      // Fetched once per call, not once per product — `includeInactive:
      // true` so a product whose category was later deactivated still
      // resolves a real slug.
      const categories = await this.categoryRepository.list({ includeInactive: true });
      const slugById = new Map(categories.map((category) => [category.id, category.slug]));

      return {
        items: result.items.map((item) =>
          toPublicProductDto(item, slugById.get(item.product.categoryId) ?? ''),
        ),
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        pageCount: result.pageCount,
      };
    });
  }

  @Get(':id')
  async findById(
    @Param('id') id: string,
    @Req() req: PublicTenantRequest,
  ): Promise<PublicProductDto> {
    return this.runInTenant(req.tenant, async () => {
      const item = await this.publicProductService.findActiveById(id);
      if (!item) {
        throw new NotFoundException('Not Found');
      }
      const category = await this.categoryRepository.findById(item.product.categoryId);
      return toPublicProductDto(item, category?.slug ?? '');
    });
  }
}
