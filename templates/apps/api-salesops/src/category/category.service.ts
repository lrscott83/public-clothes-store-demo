import { Inject, Injectable } from '@nestjs/common';
import type { Category as DomainCategory, ICategoryRepository } from '@store-mgmt/domain';
import { CATEGORY_REPOSITORY, InvalidCategoryError } from '@store-mgmt/domain';
import type { CategoryResponseDto, CreateCategoryDto, UpdateCategoryDto } from './dto/index.js';

/**
 * Orchestration layer for categories: the only place with both I/O (via
 * `CATEGORY_REPOSITORY`) and the duplicate-slug guard. Maps the domain
 * `Category` to the API's `CategoryResponseDto` (image/icon `undefined` ->
 * `null`, dates -> ISO strings).
 */
@Injectable()
export class CategoryService {
  constructor(
    @Inject(CATEGORY_REPOSITORY) private readonly categoryRepository: ICategoryRepository,
  ) {}

  async create(input: CreateCategoryDto): Promise<CategoryResponseDto> {
    const existing = await this.categoryRepository.findBySlug(input.slug);
    if (existing) {
      throw new InvalidCategoryError(`Category slug "${input.slug}" already exists`);
    }
    const created = await this.categoryRepository.create(input);
    return this.toResponse(created);
  }

  async update(id: string, patch: UpdateCategoryDto): Promise<CategoryResponseDto> {
    const updated = await this.categoryRepository.update(id, patch);
    return this.toResponse(updated);
  }

  async softDelete(id: string): Promise<void> {
    await this.categoryRepository.softDelete(id);
  }

  async findById(id: string): Promise<CategoryResponseDto | null> {
    const found = await this.categoryRepository.findById(id);
    return found ? this.toResponse(found) : null;
  }

  async findBySlug(slug: string): Promise<CategoryResponseDto | null> {
    const found = await this.categoryRepository.findBySlug(slug);
    return found ? this.toResponse(found) : null;
  }

  async list(includeInactive = false): Promise<CategoryResponseDto[]> {
    const rows = await this.categoryRepository.list({ includeInactive });
    return rows.map((row) => this.toResponse(row));
  }

  private toResponse(category: DomainCategory): CategoryResponseDto {
    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      image: category.image ?? null,
      icon: category.icon ?? null,
      order: category.order,
      active: category.active,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
    };
  }
}
