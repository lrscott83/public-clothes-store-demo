/**
 * Single source of truth for JWT/refresh-token config (ADR-4). Both
 * `apps/api-idp` (issues tokens) and `apps/api-salesops` (verifies tokens via
 * `JwtStrategy`) import THIS module — never redeclare the secret/TTL
 * elsewhere, or the two apps can drift out of sync and silently reject each
 * other's tokens.
 *
 * HS256 symmetric secret. Mirrors poolops-biz
 * `apps/api-idp/src/common/config/jwt.config.ts`.
 */

/**
 * Resolves an env-var-backed secret. Outside `production` (dev/test), an
 * unset env var falls back to `fallback` so local runs and the test suite
 * keep working without extra setup. In `production`, a missing env var
 * THROWS at import/bootstrap time — a committed fallback secret must never
 * be reachable in prod (anyone reading this file could otherwise forge
 * valid JWTs).
 */
export function resolveSecret(envVarName: string, fallback: string): string {
  const value = process.env[envVarName];
  if (value) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `${envVarName} must be set in production — refusing to start with a committed fallback secret.`,
    );
  }
  return fallback;
}

const JWT_SECRET = resolveSecret('JWT_SECRET', 'store-mgmt-dev-jwt-secret-change-me');
const REFRESH_TOKEN_SECRET = resolveSecret(
  'REFRESH_TOKEN_SECRET',
  'store-mgmt-dev-refresh-secret-change-me',
);

export interface JwtConfig {
  readonly secret: string;
  readonly signOptions: { readonly expiresIn: string };
}

export interface RefreshTokenConfig {
  readonly secret: string;
  readonly expiresIn: string;
}

/** Access-token config — consumed by `@nestjs/jwt`'s `JwtModule.register(JWT_CONFIG)` and `JwtStrategy`. */
export const JWT_CONFIG: JwtConfig = {
  secret: JWT_SECRET,
  signOptions: { expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '15m' },
};

/** Refresh-token config — opaque `rtid` tokens signed separately from the access token. */
export const REFRESH_TOKEN_CONFIG: RefreshTokenConfig = {
  secret: REFRESH_TOKEN_SECRET,
  expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
};

/** Access-token JWT payload shape — `{sub, login}` ONLY (ADR-2). Roles are resolved fresh per-request, never baked into the token. */
export interface JwtAccessPayload {
  readonly sub: string;
  readonly login: string;
}
