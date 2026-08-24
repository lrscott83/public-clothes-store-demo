import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { USER_REPOSITORY, type IUserRepository, type User, type UserRoleValue } from '@store-mgmt/domain';
import { TtlCache } from '../cache/ttl-cache.js';
import { JWT_CONFIG, type JwtAccessPayload } from './jwt.config.js';

/**
 * `req.user` shape after `JwtStrategy.validate` — master-side identity ONLY,
 * never carries `passwordHash`. This is `req.user`'s type BETWEEN
 * `JwtAuthGuard` and `TenantContextGuard` in the chain (see the
 * GUARD-ORDER INVARIANT below) — it deliberately has NO `roles`,
 * `companyId`, or `companyUserId` key at all, not even an optional one:
 * those genuinely do not exist yet at this point (spec: salesops-identity
 * "JwtStrategy output carries no roles or companyId").
 */
export type AuthenticatedUser = Omit<User, 'passwordHash' | 'roles'>;

/**
 * `req.user` shape after `TenantContextGuard` has ALSO run — the shape every
 * `@Roles(...)`-guarded controller in `apps/*` is written against.
 *
 * GUARD-ORDER INVARIANT (design D4) — REWRITTEN for the tenant-resolution
 * chain; do not delete this just because the old wording below no longer
 * applies. The chain is now THREE guards, in this exact order:
 *
 *     JwtAuthGuard  →  TenantContextGuard  →  RolesGuard
 *
 * `req.user` is `AuthenticatedUser` (above) right after `JwtAuthGuard` — no
 * `roles`/`companyId`/`companyUserId` exist yet. `JwtStrategy.validate`
 * (this file) resolves ONLY master-side identity: the `CompanyUser` row
 * these three fields come from lives in a tenant schema whose identity is
 * not yet known when Passport runs. `TenantContextGuard` resolves
 * `Membership → Company → tenant CompanyUser` (see `tenant-context.guard.ts`)
 * and is what upgrades `req.user` from `AuthenticatedUser` to this type. This
 * is a genuine sequencing dependency, not a style choice: run `RolesGuard`
 * before `TenantContextGuard`, or omit `TenantContextGuard` from the chain,
 * and `req.user` never becomes a `SanitizedUser` at all — `req.user.roles`
 * reads as `undefined` at runtime despite what this type claims, which is
 * exactly the case `RolesGuard`'s explicit check below exists to catch.
 *
 * The OLD rule here forbade introducing any THIRD guard to populate this
 * bitmask at all, on the theory that the only failure worth guarding
 * against was the bitmask landing on a stray `req` sibling field instead of
 * `req.user`. This change introduces exactly that third guard
 * (`TenantContextGuard`) — the old rule doesn't fit the new shape and is
 * retired. What it was PROTECTING is preserved instead, explicitly:
 * `RolesGuard` checks `req.user.roles === undefined` and throws a LOUD
 * `403 ('Tenant context not resolved')`, rather than letting
 * `can(undefined, mask)` silently evaluate to `0` — a 403 for every user
 * with nothing in the logs saying why. `roles` stays declared REQUIRED here
 * (same as before this change) precisely so every existing `@Roles(...)`
 * controller keeps compiling once it is wired behind `TenantContextGuard`
 * (Phase 8) — `RolesGuard`'s runtime check is what catches the guard being
 * skipped, a static type cannot. Regression test: `roles.guard.spec.ts`,
 * "tenant context not resolved".
 */
export type SanitizedUser = AuthenticatedUser & {
  readonly roles: UserRoleValue;
  readonly companyId: string;
  /**
   * `CompanyUser.id` — the stable attribution identity (design A7). REQUIRED
   * for the same reason `roles` is — see the GUARD-ORDER INVARIANT above.
   */
  readonly companyUserId: string;
};

/**
 * Bounds how often `findById` is re-queried per authenticated user. The JWT
 * `exp` claim is still checked BEFORE this cache is consulted (Passport
 * rejects expired tokens upstream), so this only bounds how soon a
 * deactivation/role-change takes effect. Mirrors poolops-biz's
 * `USER_CACHE_TTL_MS` convention.
 */
const USER_CACHE_TTL_MS = 30_000;

function sanitize(user: User): AuthenticatedUser {
  return {
    id: user.id,
    login: user.login,
    fullName: user.fullName,
    email: user.email,
    cellPhone: user.cellPhone,
    isActive: user.isActive,
    // Master-side platform flag (spec: salesops-identity "Role Resolution at
    // Authentication Time") — available after JwtAuthGuard ALONE, never baked
    // into the JWT payload ({ sub, login } per ADR-2).
    isSuperadmin: user.isSuperadmin,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/**
 * Validates the HS256 access token and resolves `req.user` FRESH per-request
 * (ADR-2) — the underlying `User` row is never baked into the token, so a
 * deactivation takes effect within `USER_CACHE_TTL_MS` at most. Rejects when
 * the user no longer exists or is inactive.
 *
 * Resolves ONLY master-side identity (spec: salesops-identity "Role
 * Resolution at Authentication Time") — no `CompanyUser` lookup happens
 * here. Returns `AuthenticatedUser`, NOT `SanitizedUser` — see the
 * GUARD-ORDER INVARIANT on `SanitizedUser` above for where role/company
 * resolution moved and why.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly userCache = new TtlCache<string, AuthenticatedUser>(USER_CACHE_TTL_MS);

  constructor(@Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: JWT_CONFIG.secret,
    });
  }

  async validate(payload: JwtAccessPayload): Promise<AuthenticatedUser> {
    const cached = this.userCache.get(payload.sub);
    if (cached) return cached;

    const user = await this.userRepository.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    const sanitized = sanitize(user);
    this.userCache.set(payload.sub, sanitized);
    return sanitized;
  }
}
