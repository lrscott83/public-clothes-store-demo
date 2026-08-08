/**
 * RefreshToken — opaque, DB-persisted refresh session. Pure shape, no
 * behavior: rotation, reuse-detection and revocation are orchestrated by
 * `AuthService` (app edge) against `IRefreshTokenRepository`.
 */
export interface RefreshToken {
  readonly id: string;
  readonly token: string; // opaque rtid (crypto.randomBytes hex)
  readonly userId: string;
  readonly expiresAt: Date;
  readonly isRevoked: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Input to persist a brand-new `RefreshToken` row. */
export interface CreateRefreshTokenInput {
  readonly id?: string;
  readonly token: string;
  readonly userId: string;
  readonly expiresAt: Date;
  readonly isRevoked?: boolean;
}
