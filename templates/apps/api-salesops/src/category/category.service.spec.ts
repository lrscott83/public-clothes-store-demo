import { Test, TestingModule } from '@nestjs/testing';
import type { Category as DomainCategory, ICategoryRepository } from '@store-mgmt/domain';
import { CATEGORY_REPOSITORY, InvalidCategoryError } from '@store-mgmt/domain';
import { CategoryService } from './category.service.js';

function buildRepoMock(): jest.Mocked<ICategoryRepository> {
  return {
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    findById: jest.fn(),
    findBySlug: jest.fn(),
    list: jest.fn(),
  };
}

const sampleCategory: DomainCategory = {
  id: 'category-uuid-1',
  name: 'Cafeteras',
  slug: 'cafeteras',
  image: null,
  icon: undefined,
  order: 1,
  active: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('CategoryService', () => {
  let service: CategoryService;
  let repo: jest.Mocked<ICategoryRepository>;

  beforeEach(async () => {
    repo = buildRepoMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [CategoryService, { provide: CATEGORY_REPOSITORY, useValue: repo }],
    }).compile();
    service = module.get(CategoryService);
  });

  describe('create', () => {
    it('creates a category and maps it to a response DTO, image/icon as null when absent', async () => {
      repo.findBySlug.mockResolvedValue(null);
      repo.create.mockResolvedValue(sampleCategory);

      const result = await service.create({ name: 'Cafeteras', slug: 'cafeteras', order: 1 });

      expect(result).toEqual({
        id: 'category-uuid-1',
        name: 'Cafeteras',
        slug: 'cafeteras',
        image: null,
        icon: null,
        order: 1,
        active: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
    });

    it('rejects a duplicate slug with a typed InvalidCategoryError, never a swallowed 500', async () => {
      repo.findBySlug.mockResolvedValue(sampleCategory);

      await expect(
        service.create({ name: 'Cafeteras 2', slug: 'cafeteras', order: 2 }),
      ).rejects.toBeInstanceOf(InvalidCategoryError);
      expect(repo.create).not.toHaveBeenCalled();
    });

    // Real invariant check — exercises the actual createCategory() domain
    // guard wired into the service, not a mocked rejection. Proves the
    // repository is never even reached on malformed input.
    it('throws InvalidCategoryError for an empty name WITHOUT reaching the repository', async () => {
      await expect(service.create({ name: '', slug: 'cafeteras', order: 1 })).rejects.toThrow(
        InvalidCategoryError,
      );

      expect(repo.findBySlug).not.toHaveBeenCalled();
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('throws InvalidCategoryError for an empty slug WITHOUT reaching the repository', async () => {
      await expect(service.create({ name: 'Cafeteras', slug: '   ', order: 1 })).rejects.toThrow(
        InvalidCategoryError,
      );

      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates a category and maps it to a response DTO', async () => {
      repo.update.mockResolvedValue({ ...sampleCategory, name: 'Cafeteras Updated' });

      const result = await service.update('category-uuid-1', { name: 'Cafeteras Updated' });

      expect(result.name).toBe('Cafeteras Updated');
      expect(repo.update).toHaveBeenCalledWith('category-uuid-1', { name: 'Cafeteras Updated' });
    });

    it('throws InvalidCategoryError when clearing name to empty, WITHOUT reaching the repository', async () => {
      await expect(service.update('category-uuid-1', { name: '' })).rejects.toThrow(
        InvalidCategoryError,
      );

      expect(repo.update).not.toHaveBeenCalled();
    });

    it('throws InvalidCategoryError when clearing slug to whitespace, WITHOUT reaching the repository', async () => {
      await expect(service.update('category-uuid-1', { slug: '   ' })).rejects.toThrow(
        InvalidCategoryError,
      );

      expect(repo.update).not.toHaveBeenCalled();
    });

    it('does not validate name/slug when the patch omits them', async () => {
      repo.update.mockResolvedValue({ ...sampleCategory, order: 5 });

      await service.update('category-uuid-1', { order: 5 });

      expect(repo.update).toHaveBeenCalledWith('category-uuid-1', { order: 5 });
    });
  });

  describe('softDelete', () => {
    it('delegates to the repository softDelete', async () => {
      await service.softDelete('category-uuid-1');
      expect(repo.softDelete).toHaveBeenCalledWith('category-uuid-1');
    });
  });

  describe('list', () => {
    it('maps every repository row to a response DTO', async () => {
      repo.list.mockResolvedValue([sampleCategory]);

      const result = await service.list();

      expect(result).toHaveLength(1);
      expect(result[0]?.slug).toBe('cafeteras');
    });
  });

  describe('findBySlug', () => {
    it('maps the found row to a response DTO', async () => {
      repo.findBySlug.mockResolvedValue(sampleCategory);

      const result = await service.findBySlug('cafeteras');

      expect(result?.slug).toBe('cafeteras');
    });

    it('returns null when not found', async () => {
      repo.findBySlug.mockResolvedValue(null);

      const result = await service.findBySlug('no-existe');

      expect(result).toBeNull();
    });
  });
});
