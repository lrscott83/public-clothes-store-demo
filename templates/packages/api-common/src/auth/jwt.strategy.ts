import { ForbiddenException, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import {
  COMPANY_USER_REPOSITORY,
  USER_REPOSITORY,
  type CompanyUser,
  type ICompanyUserRepository,
  type IUserRepository,
  type User,
  type UserRoleValue,
} from '@store-mgmt/domain';
import { TtlCache } from '../cache/ttl-cache.js';
import { JWT_CONFIG, type JwtAccessPayload } from './jwt.config.js';

/**
 * `req.user` shape after `JwtStrategy.validate` — never carries
 * `passwordHash`.
 *
 * GUARD-ORDER INVARIANT (design §0.1) — do NOT break this: the company-scoped
 * role bitmask MUST stay a property of `req.user`, it must NEVER be attached
 * to `req` as a sibling field, and no third guard may be introduced to
 * populate it. `RolesGuard` null-checks `req.user` and throws a LOUD
 * `ForbiddenException('Authentication required')`; a bitmask living on a
 * sibling field would instead arrive as `undefined`, and `can(undefined, mask)`
 * silently evaluates to `0` — a 403 for every user, with nothing in the logs
 * saying why. `roles` is therefore declared REQUIRED here so the compiler
 * refuses any path that would leave it unset.
 */
export type SanitizedUser = Omit<User, 'passwordHash' | 'roles'> & {
  readonly roles: UserRoleValue;
  readonly companyId: string;
  /**
   * `CompanyUser.id` — the stable attribution identity (design A7). REQUIRED
   * for the same reason `roles` is: sales attribution is stamped from this
   * field, and an `undefined` slipping through would write an unattributed
   * order instead of failing loudly. Attributing by the `(id, companyId)` pair
   * instead was rejected — the assignment id is the single stable key.
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

function sanitize(user: User, assignment: CompanyUser): SanitizedUser {
  return {
    id: user.id,
    login: user.login,
    fullName: user.fullName,
    email: user.email,
    cellPhone: user.cellPhone,
    isActive: user.isActive,
    roles: assignment.role,
    companyId: assignment.companyId,
    companyUserId: assignment.id,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/**
 * Validates the HS256 access token and resolves `req.user` FRESH per-request
 * (ADR-2) — roles are never baked into the token, so a deactivation or role
 * change takes effect within `USER_CACHE_TTL_MS` at most. Rejects when the
 * user no longer exists or is inactive.
 *
 * The role bitmask comes from the user's `CompanyUser` assignment, NOT from
 * the `User` row. A user with no ACTIVE assignment is authenticated but not
 * provisioned: that is a 403, never a silent zero-permission session.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);
  private readonly userCache = new TtlCache<string, SanitizedUser>(USER_CACHE_TTL_MS);

  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
    @Inject(COMPANY_USER_REPOSITORY) private readonly companyUserRepository: ICompanyUserRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: JWT_CONFIG.secret,
    });
  }

  async validate(payload: JwtAccessPayload): Promise<SanitizedUser> {
    // One cache entry holds the JOINED User+CompanyUser projection (A7), so a
    // hit skips BOTH repositories and there is a single invalidation window.
    const cached = this.userCache.get(payload.sub);
    if (cached) return cached;

    const user = await this.userRepository.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    const assignment = await this.companyUserRepository.findActiveByUserId(user.id);
    // A non-ACTIVE assignment is rejected identically to a missing one. The
    // status is re-checked here rather than trusted from the query so that a
    // repository regression cannot quietly widen access.
    if (!assignment || assignment.status !== 'ACTIVE') {
      // 403, not 401: the token is valid and the account is live — the user is
      // authenticated but NOT provisioned for any company. Logged because it
      // means data is inconsistent, not that the caller did something wrong.
      this.logger.error(
        `MISSING_COMPANY_USER: user ${user.id} has no ACTIVE CompanyUser assignment (status: ${assignment?.status ?? 'none'})`,
      );
      throw new ForbiddenException('User is not assigned to any company');
    }

    // The whole assignment is passed rather than three loose strings: `id` and
    // `companyId` are both opaque uuids, and a positional swap between them
    // would misattribute every order without failing any type check.
    const sanitized = sanitize(user, assignment);
    this.userCache.set(payload.sub, sanitized);
    return sanitized;
  }
}
