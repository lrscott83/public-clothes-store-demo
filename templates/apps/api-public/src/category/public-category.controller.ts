import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import { CATEGORY_REPOSITORY, type ICategoryRepository } from '@store-mgmt/domain';
import { TenantContextService } from '@store-mgmt/infra-db';
import { PublicTenantGuard, type PublicTenantRequest } from '../tenant/public-tenant.guard.js';
import { createRunInTenant } from '../tenant/run-in-tenant.js';
import type { PublicCategoryDto } from './dto/public-category.dto.js';

/** `GET /public/categories` (design.md §3) — active only; `ICategoryRepository.list()`'s own default already excludes `active: false`, this handler never passes `includeInactive`. */
@Controller('public/categories')
@UseGuards(PublicTenantGuard)
export class PublicCategoryController {
  private readonly runInTenant: ReturnType<typeof createRunInTenant>;

  constructor(
    @Inject(CATEGORY_REPOSITORY) private readonly categoryRepository: ICategoryRepository,
    tenantContext: TenantContextService,
  ) {
    this.runInTenant = createRunInTenant(tenantContext);
  }

  @Get()
  async list(@Req() req: PublicTenantRequest): Promise<PublicCategoryDto[]> {
    return this.runInTenant(req.tenant, async () => {
      const categories = await this.categoryRepository.list();
      return categories.map((category) => ({
        id: category.id,
        slug: category.slug,
        name: category.name,
        image: category.image ?? null,
        order: category.order,
      }));
    });
  }
}
