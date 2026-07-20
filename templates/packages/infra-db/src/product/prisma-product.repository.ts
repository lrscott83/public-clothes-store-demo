import { Injectable } from '@nestjs/common';
import type {
  CreateProductInput,
  IProductRepository,
  Product as DomainProduct,
  ProductListFilter,
  ProductUpdateInput,
} from '@store-mgmt/domain';
import { moneyFromDecimalString, moneyToDecimalString, percentFromDecimalString, percentToDecimalString } from '@store-mgmt/domain';
import { PrismaService } from '../prisma-client.js';

/** Shape shared by every row Prisma returns for the `Product` model. */
interface ProductRow {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly sku: string | null;
  readonly barcode: string | null;
  readonly price: { toString(): string };
  readonly percentDiscountPrice: { toString(): string };
  readonly discountPrice: { toString(): string };
  readonly costoUsd: { toString(): string };
  readonly categoryId: string;
  readonly image: string;
  readonly isNew: boolean;
  readonly order: number;
  readonly active: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function toDomain(row: ProductRow): DomainProduct {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    sku: row.sku ?? undefined,
    barcode: row.barcode ?? undefined,
    price: moneyFromDecimalString(row.price.toString(), 'USD'),
    percentDiscountPrice: percentFromDecimalString(row.percentDiscountPrice.toString()),
    discountPrice: moneyFromDecimalString(row.discountPrice.toString(), 'USD'),
    costoUSD: moneyFromDecimalString(row.costoUsd.toString(), 'USD'),
    categoryId: row.categoryId,
    image: row.image,
    isNew: row.isNew,
    order: row.order,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Prisma adapter for `IProductRepository`. Maps the Prisma `Decimal(18,2)`
 * columns <-> the domain's `Money` VO via `moneyFromDecimalString`/
 * `moneyToDecimalString`, and `percentDiscountPrice` (`Decimal(5,2)`) <->
 * the domain's scaled `bigint` via `percentFromDecimalString`/
 * `percentToDecimalString`. `create()` never passes `id` through to Prisma —
 * the DB always generates it. `softDelete` flips `active`, never a hard
 * DELETE (order-history FK references must never be orphaned).
 */
@Injectable()
export class PrismaProductRepository implements IProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateProductInput): Promise<DomainProduct> {
    const row = await this.prisma.product.create({
      data: {
        name: input.name,
        description: input.description,
        sku: input.sku ?? null,
        barcode: input.barcode ?? null,
        price: moneyToDecimalString(input.price),
        percentDiscountPrice: percentToDecimalString(input.percentDiscountPrice ?? 0n),
        discountPrice: moneyToDecimalString(input.discountPrice ?? moneyFromDecimalString('0', 'USD')),
        costoUsd: moneyToDecimalString(input.costoUSD),
        categoryId: input.categoryId,
        image: input.image,
        isNew: input.isNew ?? false,
        order: input.order,
        active: input.active ?? true,
      },
    });
    return toDomain(row);
  }

  async update(id: string, patch: ProductUpdateInput): Promise<DomainProduct> {
    const row = await this.prisma.product.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.sku !== undefined ? { sku: patch.sku ?? null } : {}),
        ...(patch.barcode !== undefined ? { barcode: patch.barcode ?? null } : {}),
        ...(patch.price !== undefined ? { price: moneyToDecimalString(patch.price) } : {}),
        ...(patch.percentDiscountPrice !== undefined
          ? { percentDiscountPrice: percentToDecimalString(patch.percentDiscountPrice) }
          : {}),
        ...(patch.discountPrice !== undefined
          ? { discountPrice: moneyToDecimalString(patch.discountPrice) }
          : {}),
        ...(patch.costoUSD !== undefined ? { costoUsd: moneyToDecimalString(patch.costoUSD) } : {}),
        ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
        ...(patch.image !== undefined ? { image: patch.image } : {}),
        ...(patch.isNew !== undefined ? { isNew: patch.isNew } : {}),
        ...(patch.order !== undefined ? { order: patch.order } : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
      },
    });
    return toDomain(row);
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.product.update({ where: { id }, data: { active: false } });
  }

  async findById(id: string): Promise<DomainProduct | null> {
    const row = await this.prisma.product.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async list(filter?: ProductListFilter): Promise<DomainProduct[]> {
    const rows = await this.prisma.product.findMany({
      where: {
        ...(filter?.includeInactive ? {} : { active: true }),
        ...(filter?.categoryId ? { categoryId: filter.categoryId } : {}),
      },
      orderBy: { order: 'asc' },
    });
    return rows.map(toDomain);
  }
}
