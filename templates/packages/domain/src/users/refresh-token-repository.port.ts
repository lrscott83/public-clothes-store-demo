import type { CreateRefreshTokenInput, RefreshToken } from './refresh-token.js';

/**
 * Port for reading/writing `RefreshToken` rows. Mirrors poolops
 * `refresh-token.repository.ts`. `revokeIfActive` is the ATOMIC guarded
 * rotation primitive — it returns `0` when the row was already revoked
 * (concurrent rotation race), signalling the caller to revoke the whole
 * family (reuse-detection, design §5).
 */
export interface IRefreshTokenRepository {
  create(input: CreateRefreshTokenInput): Promise<RefreshToken>;
  findByToken(token: string): Promise<RefreshToken | null>;
  /** Atomically revokes the row IF it is still active; returns the number of rows affected (0 or 1). */
  revokeIfActive(id: string): Promise<number>;
  /** Revokes every refresh token belonging to `userId`; returns the number of rows affected. */
  revokeByUserId(userId: string): Promise<number>;
  /** Deletes every expired refresh token; returns the number of rows deleted. */
  deleteExpired(): Promise<number>;
}

/** DI token for `IRefreshTokenRepository` — consumers inject by this symbol. */
export const REFRESH_TOKEN_REPOSITORY = Symbol('IRefreshTokenRepository');
