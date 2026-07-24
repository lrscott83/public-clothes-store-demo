import { Injectable } from '@nestjs/common';
import type {
  CreateRefreshTokenInput,
  IRefreshTokenRepository,
  RefreshToken as DomainRefreshToken,
} from '@store-mgmt/domain';
import { PrismaService } from '../prisma-client.js';

/** Shape shared by every row Prisma returns for the `RefreshToken` model (table `refresh_token`). */
interface RefreshTokenRow {
  readonly id: string;
  readonly token: string;
  readonly userId: string;
  readonly expiresAt: Date;
  readonly isRevoked: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function toDomain(row: RefreshTokenRow): DomainRefreshToken {
  return {
    id: row.id,
    token: row.token,
    userId: row.userId,
    expiresAt: row.expiresAt,
    isRevoked: row.isRevoked,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Prisma adapter for `IRefreshTokenRepository`. `revokeIfActive` is the
 * ATOMIC guarded rotation primitive (design.md §5) — a single guarded
 * `updateMany({ id, isRevoked: false }, { isRevoked: true })` returns `0`
 * when the row was already revoked (concurrent rotation race), signalling
 * the caller to revoke the whole family (reuse-detection).
 */
@Injectable()
export class PrismaRefreshTokenRepository implements IRefreshTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateRefreshTokenInput): Promise<DomainRefreshToken> {
    const row = await this.prisma.refreshToken.create({
      data: {
        token: input.token,
        userId: input.userId,
        expiresAt: input.expiresAt,
        isRevoked: input.isRevoked ?? false,
      },
    });
    return toDomain(row);
  }

  async findByToken(token: string): Promise<DomainRefreshToken | null> {
    const row = await this.prisma.refreshToken.findUnique({ where: { token } });
    return row ? toDomain(row) : null;
  }

  async revokeIfActive(id: string): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { id, isRevoked: false },
      data: { isRevoked: true },
    });
    return result.count;
  }

  async revokeByUserId(userId: string): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    });
    return result.count;
  }

  async deleteExpired(): Promise<number> {
    const result = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  }
}
