import { Module } from '@nestjs/common';
import { TenantContextGuard } from '@store-mgmt/api-common';
import { COMPANY_REPOSITORY, MEMBERSHIP_REPOSITORY, USER_REPOSITORY } from '@store-mgmt/domain';
import {
  InfraDbModule,
  PrismaCompanyRepository,
  PrismaMembershipRepository,
  PrismaUserRepository,
} from '@store-mgmt/infra-db';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

/**
 * `COMPANY_USER_REPOSITORY`/`PrismaCompanyUserRepository` dropped (task
 * 10.4) — `UsersService` was this module's only consumer, and it now writes
 * the tenant `CompanyUser` row directly through `TenantContextService`
 * (exported by `InfraDbModule`, already imported below) instead — same
 * retirement `CustomerModule` did for `CustomerIdentityService` in task 8.3.
 * `MEMBERSHIP_REPOSITORY` is bound here (master-side, per-module, mirrors
 * `CustomerModule`'s convention) for the ACTIVE `Membership` half of the
 * access grant `UsersService.create` writes.
 *
 * `TenantContextGuard`/`COMPANY_REPOSITORY` are bound here too (task 10.4) —
 * `UsersController` is the first `apps/api-idp` controller to need
 * `TenantContextGuard` (`CompanyController` deliberately does NOT: no
 * tenant exists yet at company-creation time). `apps/api-idp`'s `AuthModule`
 * is not `@Global()` the way `apps/api-salesops`'s is, so a guard
 * referenced by class in `@UseGuards(...)` resolves its constructor deps
 * (`MEMBERSHIP_REPOSITORY`, `COMPANY_REPOSITORY`) through THIS module's own
 * injector — same per-module convention as everything else here, not a
 * new one.
 */
@Module({
  imports: [InfraDbModule],
  controllers: [UsersController],
  providers: [
    UsersService,
    TenantContextGuard,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: MEMBERSHIP_REPOSITORY, useClass: PrismaMembershipRepository },
    { provide: COMPANY_REPOSITORY, useClass: PrismaCompanyRepository },
  ],
})
export class UsersModule {}
