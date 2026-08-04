import { Injectable } from '@nestjs/common';
import type {
  CreatePasswordResetTokenInput,
  IPasswordResetTokenRepository,
  PasswordResetToken as DomainPasswordResetToken,
} from '@store-mgmt/domain';
import { PrismaMasterService } from '../master-prisma-client.js';

/** Shape shared by every row Prisma returns for the `PasswordResetToken` model (table `password_reset_token`). */
interface PasswordResetTokenRow {
  readonly id: string;
  readonly token: string;
  readonly userId: string;
  readonly expiresAt: Date;
  readonly isUsed: boolean;
  readonly createdAt: Date;
}

function toDomain(row: PasswordResetTokenRow): DomainPasswordResetToken {
  return {
    id: row.id,
    token: row.token,
    userId: row.userId,
    expiresAt: row.expiresAt,
    isUsed: row.isUsed,
    createdAt: row.createdAt,
  };
}

/**
 * Prisma adapter for `IPasswordResetTokenRepository`. Single-use enforcement
 * (rejecting a second `resetPassword` on the same token) is a business
 * check the app service makes by reading `isUsed`/`expiresAt` BEFORE calling
 * `markAsUsed` — this repository stays a thin persistence adapter, so
 * `markAsUsed` on an already-used token is a no-op-safe write (design.md).
 */
@Injectable()
export class PrismaPasswordResetTokenRepository implements IPasswordResetTokenRepository {
  constructor(private readonly prisma: PrismaMasterService) {}

  async create(input: CreatePasswordResetTokenInput): Promise<DomainPasswordResetToken> {
    const row = await this.prisma.passwordResetToken.create({
      data: {
        token: input.token,
        userId: input.userId,
        expiresAt: input.expiresAt,
        isUsed: input.isUsed ?? false,
      },
    });
    return toDomain(row);
  }

  async findByToken(token: string): Promise<DomainPasswordResetToken | null> {
    const row = await this.prisma.passwordResetToken.findUnique({ where: { token } });
    return row ? toDomain(row) : null;
  }

  async markAsUsed(id: string): Promise<void> {
    await this.prisma.passwordResetToken.update({ where: { id }, data: { isUsed: true } });
  }

  async revokeByUserId(userId: string): Promise<number> {
    const result = await this.prisma.passwordResetToken.updateMany({
      where: { userId, isUsed: false },
      data: { isUsed: true },
    });
    return result.count;
  }

  async deleteExpired(): Promise<number> {
    const result = await this.prisma.passwordResetToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  }
}
