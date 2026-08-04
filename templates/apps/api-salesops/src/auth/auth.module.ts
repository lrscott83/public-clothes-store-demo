import { Global, Module } from '@nestjs/common';
import { JwtStrategy, TenantContextGuard } from '@store-mgmt/api-common';
import { COMPANY_REPOSITORY, MEMBERSHIP_REPOSITORY, USER_REPOSITORY } from '@store-mgmt/domain';
import { PassportModule } from '@nestjs/passport';
import {
  InfraDbModule,
  PrismaCompanyRepository,
  PrismaMembershipRepository,
  PrismaUserRepository,
} from '@store-mgmt/infra-db';

/**
 * Wires the shared auth kit's `JwtStrategy` (from `@store-mgmt/api-common`,
 * ADR-3) into `api-salesops` — this app only VERIFIES access tokens issued
 * by `apps/api-idp`, it never signs one (no `LocalStrategy`, no
 * `JwtModule.register` needed here). Binds `USER_REPOSITORY` so
 * `JwtStrategy.validate` can resolve `req.user` FRESH per request (ADR-2).
 * `JwtStrategy` only needs to be provided ONCE, in a module eagerly imported
 * by `AppModule` — `JwtAuthGuard`/`AuthGuard('jwt')` then works from any
 * controller in the app, because Passport strategy registration is a side
 * effect of the provider's construction at bootstrap, not of per-module DI
 * scoping (mirrors `apps/api-idp`'s `AuthModule` precedent).
 *
 * `@Global()` (new, Phase 8/D4) — `TenantContextGuard` is referenced by
 * `@UseGuards(...)` on 10 controllers spread across 9 different feature
 * modules (`CurrencyModule`, `ProductModule`, ...), none of which import
 * `AuthModule` today. A guard passed by class reference is instantiated
 * through the HOST module's own injector, so its constructor deps
 * (`MEMBERSHIP_REPOSITORY`, `COMPANY_REPOSITORY`) must be resolvable from
 * every one of those modules — global export is the one-module fix, instead
 * of adding `imports: [AuthModule]` to all 10. `MEMBERSHIP_REPOSITORY`/
 * `COMPANY_REPOSITORY` feed `TenantContextGuard`'s own resolution chain
 * (design D4); `JwtStrategy` no longer needs `COMPANY_USER_REPOSITORY` at
 * all (Phase 7 moved that lookup into the guard) — that binding is dropped
 * here, not carried forward.
 */
@Global()
@Module({
  imports: [PassportModule, InfraDbModule],
  providers: [
    JwtStrategy,
    TenantContextGuard,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: MEMBERSHIP_REPOSITORY, useClass: PrismaMembershipRepository },
    { provide: COMPANY_REPOSITORY, useClass: PrismaCompanyRepository },
  ],
  exports: [TenantContextGuard],
})
export class AuthModule {}
