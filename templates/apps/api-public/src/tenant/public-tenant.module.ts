import { Global, Module } from '@nestjs/common';
import { COMPANY_REPOSITORY } from '@store-mgmt/domain';
import { InfraDbModule, PrismaCompanyRepository } from '@store-mgmt/infra-db';
import { PublicTenantGuard } from './public-tenant.guard.js';

/**
 * `@Global()` — mirrors `api-salesops`'s `AuthModule` doc comment, and the
 * DI defect class it documents (`TenantContextGuard`'s own history):
 * `PublicTenantGuard` is referenced by `@UseGuards(...)` on every guarded
 * controller in this app (product, category, store), none of which import
 * each other's module. A guard passed by class reference is instantiated
 * through its HOST module's own injector, so the guard's constructor
 * dependency (`COMPANY_REPOSITORY`) must be resolvable from every one of
 * those modules — global export is the one-module fix.
 *
 * `COMPANY_REPOSITORY` MUST also be in `exports`, not only `providers` —
 * `@Global()` only propagates a module's EXPORTED providers application-
 * wide.
 */
@Global()
@Module({
  imports: [InfraDbModule],
  providers: [PublicTenantGuard, { provide: COMPANY_REPOSITORY, useClass: PrismaCompanyRepository }],
  exports: [PublicTenantGuard, COMPANY_REPOSITORY],
})
export class PublicTenantModule {}
