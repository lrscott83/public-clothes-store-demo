import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from '@store-mgmt/api-common';
import { USER_REPOSITORY } from '@store-mgmt/domain';
import { InfraDbModule, PrismaUserRepository } from '@store-mgmt/infra-db';

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
 */
@Module({
  imports: [PassportModule, InfraDbModule],
  providers: [JwtStrategy, { provide: USER_REPOSITORY, useClass: PrismaUserRepository }],
})
export class AuthModule {}
