import { Injectable } from '@nestjs/common';
import type { IUserRepository, User as DomainUser, UserUpdateInput } from '@store-mgmt/domain';
import { DuplicateLoginError, type CreateUserInput } from '@store-mgmt/domain';
import { Prisma } from '../../generated/client/client.js';
import { PrismaService } from '../prisma-client.js';

/** Shape shared by every row Prisma returns for the `User` model (table `app_user`). */
interface UserRow {
  readonly id: string;
  readonly login: string;
  readonly passwordHash: string;
  readonly fullName: string;
  readonly email: string | null;
  readonly cellPhone: string | null;
  readonly isActive: boolean;
  readonly roles: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function toDomain(row: UserRow): DomainUser {
  return {
    id: row.id,
    login: row.login,
    passwordHash: row.passwordHash,
    fullName: row.fullName,
    email: row.email,
    cellPhone: row.cellPhone,
    isActive: row.isActive,
    roles: row.roles,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * True when `err` is a Prisma unique-constraint violation (P2002) on
 * `target`. Mirrors `PrismaCustomerRepository.isUniqueViolation` — the
 * driver-adapter + WASM query compiler architecture surfaces the violated
 * column(s) at `err.meta.driverAdapterError.cause.constraint.fields`, NOT
 * the classic `err.meta.target`; both are checked.
 */
function isUniqueViolation(err: unknown, target: string): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') {
    return false;
  }

  const meta = err.meta as
    | {
        target?: string | string[];
        driverAdapterError?: { cause?: { constraint?: { fields?: string[] } } };
      }
    | undefined;

  if (Array.isArray(meta?.target)) return meta.target.includes(target);
  if (typeof meta?.target === 'string') return meta.target === target;

  const fields = meta?.driverAdapterError?.cause?.constraint?.fields;
  return Array.isArray(fields) && fields.includes(target);
}

/**
 * Prisma adapter for `IUserRepository`. `create()` never passes `id`
 * through to Prisma — the DB always generates it (`@default(uuid())`).
 * `create` translates the P2002 unique violation on `login` to the domain
 * `DuplicateLoginError` — there is deliberately NO application-level
 * pre-check, the unique index is the single source of truth (mirrors
 * `PrismaCustomerRepository`'s `document_id` handling). `findByLogin` is
 * used only by `LocalStrategy`/`validateUser` at login time; `findById` is
 * used by `JwtStrategy` to resolve `req.user` FRESH per request (ADR-2).
 */
@Injectable()
export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateUserInput): Promise<DomainUser> {
    try {
      const row = await this.prisma.user.create({
        data: {
          login: input.login,
          passwordHash: input.passwordHash,
          fullName: input.fullName,
          email: input.email ?? null,
          cellPhone: input.cellPhone ?? null,
          isActive: input.isActive ?? true,
          roles: input.roles ?? 1,
        },
      });
      return toDomain(row);
    } catch (err) {
      if (isUniqueViolation(err, 'login')) {
        throw new DuplicateLoginError(`login "${input.login}" is already in use`);
      }
      throw err;
    }
  }

  /**
   * SECURITY (FIX 4): explicit allow-list, and `passwordHash` is
   * deliberately NOT one of the columns here — even if a caller bypasses the
   * `UserUpdateInput` type (e.g. via an `as any`/`as never` cast), this
   * method physically cannot write `passwordHash`. Use `updatePassword` for
   * that — the ONLY path allowed to touch it.
   */
  async update(id: string, patch: UserUpdateInput): Promise<DomainUser> {
    try {
      const row = await this.prisma.user.update({
        where: { id },
        data: {
          ...(patch.login !== undefined ? { login: patch.login } : {}),
          ...(patch.fullName !== undefined ? { fullName: patch.fullName } : {}),
          ...(patch.email !== undefined ? { email: patch.email } : {}),
          ...(patch.cellPhone !== undefined ? { cellPhone: patch.cellPhone } : {}),
          ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
          ...(patch.roles !== undefined ? { roles: patch.roles } : {}),
        },
      });
      return toDomain(row);
    } catch (err) {
      if (isUniqueViolation(err, 'login')) {
        throw new DuplicateLoginError(`login "${patch.login}" is already in use`);
      }
      throw err;
    }
  }

  /** The ONLY method allowed to change `passwordHash` (SECURITY FIX 4). */
  async updatePassword(id: string, passwordHash: string): Promise<DomainUser> {
    const row = await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    return toDomain(row);
  }

  async findById(id: string): Promise<DomainUser | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findByLogin(login: string): Promise<DomainUser | null> {
    const row = await this.prisma.user.findUnique({ where: { login } });
    return row ? toDomain(row) : null;
  }

  async list(): Promise<DomainUser[]> {
    const rows = await this.prisma.user.findMany({ orderBy: { fullName: 'asc' } });
    return rows.map(toDomain);
  }
}
