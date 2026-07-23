import type { CreatePasswordResetTokenInput, PasswordResetToken } from './password-reset-token.js';

/**
 * Port for reading/writing `PasswordResetToken` rows. Single-use enforcement
 * (rejecting a second `resetPassword` call on the same token) is a business
 * check the app service makes by reading `isUsed`/`expiresAt` before calling
 * `markAsUsed` — the repository itself stays a thin persistence adapter.
 */
export interface IPasswordResetTokenRepository {
  create(input: CreatePasswordResetTokenInput): Promise<PasswordResetToken>;
  findByToken(token: string): Promise<PasswordResetToken | null>;
  markAsUsed(id: string): Promise<void>;
  /** Revokes (marks used) every unused password-reset token for `userId`. */
  revokeByUserId(userId: string): Promise<number>;
  /** Deletes every expired password-reset token; returns the number of rows deleted. */
  deleteExpired(): Promise<number>;
}

/** DI token for `IPasswordResetTokenRepository` — consumers inject by this symbol. */
export const PASSWORD_RESET_TOKEN_REPOSITORY = Symbol('IPasswordResetTokenRepository');
