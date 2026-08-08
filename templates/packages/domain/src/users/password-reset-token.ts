/**
 * PasswordResetToken — opaque, single-use, expiring token. Pure shape, no
 * behavior: single-use enforcement and expiry checks are orchestrated by
 * `AuthService` (app edge) against `IPasswordResetTokenRepository`.
 */
export interface PasswordResetToken {
  readonly id: string;
  readonly token: string; // opaque single-use token
  readonly userId: string;
  readonly expiresAt: Date;
  readonly isUsed: boolean;
  readonly createdAt: Date;
}

/** Input to persist a brand-new `PasswordResetToken` row. */
export interface CreatePasswordResetTokenInput {
  readonly id?: string;
  readonly token: string;
  readonly userId: string;
  readonly expiresAt: Date;
  readonly isUsed?: boolean;
}
