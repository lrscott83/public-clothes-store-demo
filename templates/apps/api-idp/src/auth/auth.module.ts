import { Module } from '@nestjs/common';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JWT_CONFIG, JwtStrategy } from '@store-mgmt/api-common';
import {
  PASSWORD_RESET_TOKEN_REPOSITORY,
  REFRESH_TOKEN_REPOSITORY,
  USER_REPOSITORY,
} from '@store-mgmt/domain';
import {
  InfraDbModule,
  PrismaPasswordResetTokenRepository,
  PrismaRefreshTokenRepository,
  PrismaUserRepository,
} from '@store-mgmt/infra-db';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { LocalStrategy } from './local.strategy.js';

/**
 * Wires the auth kit's shared `JwtStrategy` (from `@store-mgmt/api-common`,
 * ADR-3) alongside this app's OWN `LocalStrategy` (the only app with one,
 * ADR-1). Binds the identity ports this module needs directly — mirrors
 * `SalesModule`'s per-module repository binding convention (`UsersModule`
 * binds `USER_REPOSITORY` again independently). `COMPANY_REPOSITORY` is
 * deliberately NOT bound here — nothing in this module touches it anymore
 * (see `AuthService.signup`); it lives in `CompanyModule` instead, which
 * owns the provisioning saga that actually writes `Company` rows.
 * `COMPANY_USER_REPOSITORY` is ALSO no longer bound here (task 10.4) —
 * `AuthService` no longer resolves a company-scoped role at login/refresh
 * time at all (see `AuthService.issueTokens`), so nothing in this module
 * depends on it any more.
 */
@Module({
  // `JWT_CONFIG.signOptions.expiresIn` is typed as a plain `string` in
  // `@store-mgmt/api-common` (env-var friendly, e.g. `'15m'`); `@nestjs/jwt`
  // types it against `jsonwebtoken`'s stricter `StringValue` template-literal
  // type. The runtime value is a valid `ms`-style string either way — this
  // cast only bridges the two type definitions, no behavior change.
  imports: [PassportModule, JwtModule.register(JWT_CONFIG as JwtModuleOptions), InfraDbModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    LocalStrategy,
    JwtStrategy,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: REFRESH_TOKEN_REPOSITORY, useClass: PrismaRefreshTokenRepository },
    { provide: PASSWORD_RESET_TOKEN_REPOSITORY, useClass: PrismaPasswordResetTokenRepository },
  ],
})
export class AuthModule {}
