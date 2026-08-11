import { Controller, Get, Inject, NotFoundException, Req, UseGuards } from '@nestjs/common';
import { COMPANY_REPOSITORY, type ICompanyRepository } from '@store-mgmt/domain';
import { PublicTenantGuard, type PublicTenantRequest } from '../tenant/public-tenant.guard.js';

export interface PublicStoreDto {
  readonly name: string;
  readonly slug: string;
}

/**
 * `GET /public/store` (design.md §3) — "lets a loader fail fast before
 * rendering". Reads the MASTER `Company` row directly via
 * `ICompanyRepository.findById`; no tenant-schema access is needed, so no
 * `runInTenant` here — mirrors `PublicTenantGuard`'s own schema-independent
 * query (spike 0.2).
 */
@Controller('public/store')
@UseGuards(PublicTenantGuard)
export class StoreController {
  constructor(@Inject(COMPANY_REPOSITORY) private readonly companyRepository: ICompanyRepository) {}

  @Get()
  async get(@Req() req: PublicTenantRequest): Promise<PublicStoreDto> {
    const company = await this.companyRepository.findById(req.tenant.companyId);
    if (!company) {
      // Defensive: PublicTenantGuard already resolved this company moments
      // ago. Only reachable if it was deleted mid-request.
      throw new NotFoundException('Not Found');
    }
    return { name: company.name, slug: company.slug };
  }
}
