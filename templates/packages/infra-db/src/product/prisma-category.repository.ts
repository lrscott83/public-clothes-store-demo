import { Injectable } from '@nestjs/common';
import type {
  Category as DomainCategory,
  CategoryListFilter,
  CategoryUpdateInput,
  CreateCategoryInput,
  ICategoryRepository,
} from '@store-mgmt/domain';
import { PrismaService } from '../prisma-client.js';

/** Shape shared by every row Prisma returns for the `Category` model. */
interface CategoryRow {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly image: string | null;
  readonly icon: string | null;
  readonly order: number;
  readonly active: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function toDomain(row: CategoryRow): DomainCategory {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    image: row.image ?? undefined,
    icon: row.icon ?? undefined,
    order: row.order,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Prisma adapter for `ICategoryRepository`. `create()` never passes `id`
 * through to Prisma — the DB always generates it (`@default(uuid())`), even
 * though the domain's `createCategory` factory can mint its own id for
 * standalone/in-memory use. `softDelete` flips `active`, never a hard DELETE.
 */
@Injectable()
export class PrismaCategoryRepository implements ICategoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateCategoryInput): Promise<DomainCategory> {
    const row = await this.prisma.category.create({
      data: {
        name: input.name,
        slug: input.slug,
        image: input.image ?? null,
        icon: input.icon ?? null,
        order: input.order,
        active: input.active ?? true,
      },
    });
    return toDomain(row);
  }

  async update(id: string, patch: CategoryUpdateInput): Promise<DomainCategory> {
    const row = await this.prisma.category.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.slug !== undefined ? { slug: patch.slug } : {}),
        ...(patch.image !== undefined ? { image: patch.image ?? null } : {}),
        ...(patch.icon !== undefined ? { icon: patch.icon ?? null } : {}),
        ...(patch.order !== undefined ? { order: patch.order } : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
      },
    });
    return toDomain(row);
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.category.update({ where: { id }, data: { active: false } });
  }

  async findById(id: string): Promise<DomainCategory | null> {
    const row = await this.prisma.category.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findBySlug(slug: string): Promise<DomainCategory | null> {
    const row = await this.prisma.category.findUnique({ where: { slug } });
    return row ? toDomain(row) : null;
  }

  async list(filter?: CategoryListFilter): Promise<DomainCategory[]> {
    const rows = await this.prisma.category.findMany({
      where: filter?.includeInactive ? {} : { active: true },
      orderBy: { order: 'asc' },
    });
    return rows.map(toDomain);
  }
}
