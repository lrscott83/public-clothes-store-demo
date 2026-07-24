import { Injectable } from '@nestjs/common';
import type {
  CreateCustomerInput,
  Customer as DomainCustomer,
  CustomerListFilter,
  CustomerUpdateInput,
  ICustomerRepository,
} from '@store-mgmt/domain';
import {
  CustomerUserNotFoundError,
  DuplicateCustomerDocumentError,
  DuplicateCustomerUserError,
} from '@store-mgmt/domain';
import { Prisma } from '../../generated/client/client.js';
import { PrismaService } from '../prisma-client.js';

/** Shape shared by every row Prisma returns for the `Customer` model. */
interface CustomerRow {
  readonly id: string;
  readonly userId: string;
  readonly fullName: string;
  readonly documentId: string | null;
  readonly cellPhone: string | null;
  readonly email: string | null;
  readonly address: string | null;
  readonly note: string | null;
  readonly active: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function toDomain(row: CustomerRow): DomainCustomer {
  return {
    id: row.id,
    userId: row.userId,
    fullName: row.fullName,
    documentId: row.documentId,
    cellPhone: row.cellPhone,
    email: row.email,
    address: row.address,
    note: row.note,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * True when `err` is a Prisma unique-constraint violation (P2002) on
 * `target`. With the driver-adapter (`@prisma/adapter-pg`) + WASM query
 * compiler architecture, the violated column(s) surface at
 * `err.meta.driverAdapterError.cause.constraint.fields`, NOT the classic
 * `err.meta.target` — both are checked so this keeps working if Prisma
 * reverts the shape.
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

/** True when `err` is a Prisma foreign-key-constraint violation (P2003) — the referenced row does not exist. */
function isForeignKeyViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003';
}

/**
 * Prisma adapter for `ICustomerRepository`. `create()` never passes `id`
 * through to Prisma — the DB always generates it (`@default(uuid())`).
 * `create`/`update` catch the Prisma P2002 unique violation on
 * `document_id` and translate it to the domain
 * `DuplicateCustomerDocumentError` (design.md's central decision) — there is
 * deliberately NO application-level pre-check, the unique index is the
 * single source of truth. `create` ALSO translates a P2002 on `user_id`
 * (the 1:1 link is unique) to `DuplicateCustomerUserError`, and a P2003 FK
 * violation on `user_id` (no such `User`) to `CustomerUserNotFoundError`
 * (backend-users-roles). `softDelete` flips `active`, never a hard DELETE.
 * Mirrors `PrismaWarehouseRepository`.
 */
@Injectable()
export class PrismaCustomerRepository implements ICustomerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateCustomerInput): Promise<DomainCustomer> {
    try {
      const row = await this.prisma.customer.create({
        data: {
          userId: input.userId,
          fullName: input.fullName,
          documentId: input.documentId ?? null,
          cellPhone: input.cellPhone ?? null,
          email: input.email ?? null,
          address: input.address ?? null,
          note: input.note ?? null,
          active: input.active ?? true,
        },
      });
      return toDomain(row);
    } catch (err) {
      if (isUniqueViolation(err, 'document_id')) {
        throw new DuplicateCustomerDocumentError(
          `documentId "${input.documentId}" is already in use`,
        );
      }
      if (isUniqueViolation(err, 'user_id')) {
        throw new DuplicateCustomerUserError(`userId "${input.userId}" already has a Customer`);
      }
      if (isForeignKeyViolation(err)) {
        throw new CustomerUserNotFoundError(`User "${input.userId}" does not exist`);
      }
      throw err;
    }
  }

  async update(id: string, patch: CustomerUpdateInput): Promise<DomainCustomer> {
    try {
      const row = await this.prisma.customer.update({
        where: { id },
        data: {
          ...(patch.fullName !== undefined ? { fullName: patch.fullName } : {}),
          ...(patch.documentId !== undefined ? { documentId: patch.documentId } : {}),
          ...(patch.cellPhone !== undefined ? { cellPhone: patch.cellPhone } : {}),
          ...(patch.email !== undefined ? { email: patch.email } : {}),
          ...(patch.address !== undefined ? { address: patch.address } : {}),
          ...(patch.note !== undefined ? { note: patch.note } : {}),
          ...(patch.active !== undefined ? { active: patch.active } : {}),
        },
      });
      return toDomain(row);
    } catch (err) {
      if (isUniqueViolation(err, 'document_id')) {
        throw new DuplicateCustomerDocumentError(
          `documentId "${patch.documentId}" is already in use`,
        );
      }
      throw err;
    }
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.customer.update({ where: { id }, data: { active: false } });
  }

  async findById(id: string): Promise<DomainCustomer | null> {
    const row = await this.prisma.customer.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async list(filter?: CustomerListFilter): Promise<DomainCustomer[]> {
    const rows = await this.prisma.customer.findMany({
      where: filter?.includeInactive ? {} : { active: true },
      orderBy: { fullName: 'asc' },
    });
    return rows.map(toDomain);
  }
}
