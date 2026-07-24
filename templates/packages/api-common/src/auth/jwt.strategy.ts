import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { USER_REPOSITORY, type IUserRepository, type User } from '@store-mgmt/domain';
import { TtlCache } from '../cache/ttl-cache.js';
import { JWT_CONFIG, type JwtAccessPayload } from './jwt.config.js';

/** `req.user` shape after `JwtStrategy.validate` — never carries `passwordHash`. */
export type SanitizedUser = Omit<User, 'passwordHash'>;

/**
 * Bounds how often `findById` is re-queried per authenticated user. The JWT
 * `exp` claim is still checked BEFORE this cache is consulted (Passport
 * rejects expired tokens upstream), so this only bounds how soon a
 * deactivation/role-change takes effect. Mirrors poolops-biz's
 * `USER_CACHE_TTL_MS` convention.
 */
const USER_CACHE_TTL_MS = 30_000;

function sanitize(user: User): SanitizedUser {
  return {
    id: user.id,
    login: user.login,
    fullName: user.fullName,
    email: user.email,
    cellPhone: user.cellPhone,
    isActive: user.isActive,
    roles: user.roles,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/**
 * Validates the HS256 access token and resolves `req.user` FRESH per-request
 * via `IUserRepository.findById` (ADR-2) — roles are never baked into the
 * token, so a deactivation or role change takes effect within
 * `USER_CACHE_TTL_MS` at most. Rejects when the user no longer exists or is
 * inactive.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly userCache = new TtlCache<string, SanitizedUser>(USER_CACHE_TTL_MS);

  constructor(@Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: JWT_CONFIG.secret,
    });
  }

  async validate(payload: JwtAccessPayload): Promise<SanitizedUser> {
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
