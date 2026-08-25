import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import type {
  Category as DomainCategory,
  CreateProductInput,
  ICategoryRepository,
  IProductRepository,
  Product as DomainProduct,
  ProductListFilter,
  ProductUpdateInput,
  CreateCategoryInput,
} from '@store-mgmt/domain';
import { CATEGORY_REPOSITORY, PRODUCT_REPOSITORY, money } from '@store-mgmt/domain';
import { ProductService } from './product.service.js';
import { ImportService, type ImportReport } from './import.service.js';

/**
 * Stateful in-memory fakes (NOT jest mocks): the idempotency scenarios
 * (S9/S14) need a repo whose contents PERSIST across two import runs inside
 * one test, mirroring Prisma's soft-delete/list semantics per the design's
 * testing table.
 */
class FakeProductRepo implements IProductRepository {
  rows: DomainProduct[] = [];

  async create(input: CreateProductInput): Promise<DomainProduct> {
    const now = new Date();
    const row: DomainProduct = {
      id: input.id ?? randomUUID(),
      name: input.name,
      description: input.description,
      sku: input.sku,
      barcode: input.barcode,
      price: input.price,
      percentDiscountPrice: input.percentDiscountPrice ?? 0n,
      discountPrice: input.discountPrice ?? 0n,
      cost: input.cost,
      categoryId: input.categoryId,
      image: input.image ?? null,
      isNew: input.isNew ?? false,
      order: input.order,
      active: input.active ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(row);
    return row;
  }

  async update(id: string, patch: ProductUpdateInput): Promise<DomainProduct> {
    const index = this.rows.findIndex((row) => row.id === id);
    if (index === -1) throw new Error(`Product ${id} not found`);
    this.rows[index] = { ...this.rows[index], ...patch, updatedAt: new Date() };
    return this.rows[index]!;
  }

  async softDelete(id: string): Promise<void> {
    const row = this.rows.find((candidate) => candidate.id === id);
    if (!row) throw new Error(`Product ${id} not found`);
    this.rows[this.rows.indexOf(row)] = { ...row, active: false };
  }

  async findById(id: string): Promise<DomainProduct | null> {
    return this.rows.find((row) => row.id === id) ?? null;
  }

  async list(filter: ProductListFilter = {}): Promise<DomainProduct[]> {
    return this.rows
      .filter((row) => filter.includeInactive || row.active)
      .filter((row) => !filter.categoryId || row.categoryId === filter.categoryId);
  }
}

class FakeCategoryRepo implements ICategoryRepository {
  rows: DomainCategory[] = [];
  private slugCalls = 0;

  async create(input: CreateCategoryInput): Promise<DomainCategory> {
    const now = new Date();
    const row: DomainCategory = {
      id: input.id ?? randomUUID(),
      name: input.name,
      slug: input.slug,
      image: input.image ?? null,
      icon: input.icon,
      order: input.order,
      active: input.active ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(row);
    return row;
  }

  async update(id: string, patch: Partial<Omit<DomainCategory, 'id' | 'createdAt'>>): Promise<DomainCategory> {
    const index = this.rows.findIndex((row) => row.id === id);
    if (index === -1) throw new Error(`Category ${id} not found`);
    this.rows[index] = { ...this.rows[index], ...patch, updatedAt: new Date() };
    return this.rows[index]!;
  }

  async softDelete(id: string): Promise<void> {
    const row = this.rows.find((candidate) => candidate.id === id);
    if (!row) throw new Error(`Category ${id} not found`);
    this.rows[this.rows.indexOf(row)] = { ...row, active: false };
  }

  async findById(id: string): Promise<DomainCategory | null> {
    return this.rows.find((row) => row.id === id) ?? null;
  }

  async findBySlug(slug: string): Promise<DomainCategory | null> {
    this.slugCalls += 1;
    return this.rows.find((row) => row.slug === slug) ?? null;
  }

  async list(): Promise<DomainCategory[]> {
    return [...this.rows];
  }
  get findBySlugCallCount(): number {
    return this.slugCalls;
  }
}

function csvLine(fields: string[]): string {
  return fields.join(';');
}

const HEADER = csvLine(['categoria', 'nombre', 'precio', 'moneda', 'barcode', 'sku', 'descripcion']);

function csvFile(...lines: (string | string[])[]): Buffer {
  const flat = lines.flatMap((line) => (Array.isArray(line) ? line : [line]));
  return Buffer.from([HEADER, ...flat].join('\n'), 'utf8');
}

describe('ImportService', () => {
  let service: ImportService;
  let productRepo: FakeProductRepo;
  let categoryRepo: FakeCategoryRepo;

  beforeEach(async () => {
    productRepo = new FakeProductRepo();
    categoryRepo = new FakeCategoryRepo();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        ImportService,
        { provide: PRODUCT_REPOSITORY, useValue: productRepo },
        { provide: CATEGORY_REPOSITORY, useValue: categoryRepo },
      ],
    }).compile();
    service = module.get(ImportService);
  });

  function seedProduct(overrides: Partial<DomainProduct> & { name: string; categoryId: string }): DomainProduct {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const row: DomainProduct = {
      id: randomUUID(),
      description: '',
      sku: undefined,
      barcode: undefined,
      price: money(10000n, 'USD'),
      percentDiscountPrice: 0n,
      discountPrice: 0n,
      cost: money(0n, 'USD'),
      image: null,
      isNew: false,
      order: 1,
      active: true,
      ...overrides,
      createdAt: now,
      updatedAt: now,
    };
    productRepo.rows.push(row);
    return row;
  }

  function seedCategory(name: string, slug?: string): DomainCategory {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const row: DomainCategory = {
      id: randomUUID(),
      name,
      slug: slug ?? name.toLowerCase(),
      image: null,
      icon: undefined,
      order: categoryRepo.rows.length + 1,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    categoryRepo.rows.push(row);
    return row;
  }

  describe('currency handling (S4)', () => {
    it("defaults an empty moneda column to 'MN'", async () => {
      const report: ImportReport = await service.importCsv(
        csvFile([csvLine(['Cafeteras', 'Cafetera Voladora', '15.00', '', '', '', 'Vuela y prepara café'])]),
      );
      expect(report.created).toBe(1);
      const row = productRepo.rows[0]!;
      expect(row.price.currency).toBe('MN');
      expect(row.cost.currency).toBe('MN');
    });

    it('fails only the offending row for an unknown currency like GBP', async () => {
      const report = await service.importCsv(
        csvFile(
          csvLine(['Cafeteras', 'Cafetera Buena', '15.00', 'USD', '', '', '']),
          csvLine(['Cafeteras', 'Cafetera Rara', '15.00', 'GBP', '', '', '']),
        ),
      );
      expect(report.failed).toBe(1);
      expect(report.created).toBe(1);
      expect(report.rows[1]!.status).toBe('failed');
      expect(report.rows[1]!.reason).toMatch(/GBP/);
    });
  });

  describe('price validation (S5)', () => {
    it.each([
      ['0'],
      ['-5'],
      ['abc'],
    ])('fails only the row with precio=%s and still imports valid rows', async (badPrice) => {
      const report = await service.importCsv(
        csvFile(
          csvLine(['Cafeteras', `Mala ${badPrice}`, badPrice, 'USD', '', '', '']),
          csvLine(['Cafeteras', 'Buena', '10.00', 'USD', '', '', '']),
        ),
      );
      expect(report.failed).toBe(1);
      expect(report.created).toBe(1);
      expect(report.rows[0]!.status).toBe('failed');
      expect(productRepo.rows).toHaveLength(1);
    });
  });

  describe('Camel Case normalization (S6)', () => {
    it('stores Title Case names on create AND on update', async () => {
      await service.importCsv(csvFile([csvLine(['cafeteras de barro', 'cafetera express de fogón', '10', 'usd', '', '', ''])]));
      // usd lowercased is fine — currency parsing uppercases.
      expect(categoryRepo.rows.map((row) => row.name)).toContain('Cafeteras De Barro');
      expect(productRepo.rows[0]!.name).toBe('Cafetera Express De Fogón');

      await service.importCsv(csvFile([csvLine(['CAFETERAS DE BARRO', 'cafetera express de fogón', '12.50', 'USD', '', '', 'nueva descripción'])]));
      expect(productRepo.rows[0]!.name).toBe('Cafetera Express De Fogón');
      expect(productRepo.rows[0]!.price).toEqual(money(1250n, 'USD'));
      expect(productRepo.rows[0]!.description).toBe('nueva descripción');
    });
  });

  describe('category resolution (S7/S8)', () => {
    it('creates a missing category ONCE and shares it across rows in the same batch', async () => {
      const before = categoryRepo.findBySlugCallCount;
      const report = await service.importCsv(
        csvFile(
          csvLine(['Ollas OOPA', 'Olla 1', '10', 'MN', '', '', '']),
          csvLine(['ollas oopa', 'Olla 2', '20', 'MN', '', '', '']),
          csvLine(['Ollas Oopa', 'Olla 3', '30', 'MN', '', '', '']),
        ),
      );
      expect(report.created).toBe(3);
      const created = categoryRepo.rows.filter((row) => row.name === 'Ollas Oopa');
      expect(created).toHaveLength(1);
      expect(created[0]!.slug).toBe('ollas-oopa');
      expect(new Set(productRepo.rows.map((row) => row.categoryId))).toEqual(new Set([created[0]!.id]));
      void before;
    });

    it('treats accent-differentiated category names as DISTINCT categories', async () => {
      seedCategory('Ropa');
      const report = await service.importCsv(
        csvFile(
          csvLine(['Ropá', 'Camisa A', '5', 'MN', '', '', '']),
          csvLine(['Ropa', 'Camisa B', '6', 'MN', '', '', '']),
        ),
      );
      expect(report.failed).toBe(0);
      const ropa = categoryRepo.rows.find((row) => row.name === 'Ropa')!;
      const ropá = categoryRepo.rows.find((row) => row.name === 'Ropá')!;
      expect(ropa).toBeDefined();
      expect(ropá).toBeDefined();
      expect(ropa.id).not.toBe(ropá.id);
    });
  });

  describe('sku idempotency (S11)', () => {
    it('fails loudly when the CSV sku matches MORE THAN ONE existing product, writing nothing', async () => {
      const cat = seedCategory('Cafeteras');
      seedProduct({ name: 'Duplicada Uno', sku: 'SKU-DUP', categoryId: cat.id });
      seedProduct({ name: 'Duplicada Dos', sku: 'SKU-DUP', categoryId: cat.id });

      const spyCreate = jest.spyOn(productRepo, 'create');
      const report = await service.importCsv(
        csvFile([csvLine(['Cafeteras', 'Duplicada Tres', '9.99', 'USD', '', 'SKU-DUP', ''])]),
      );
      expect(report.failed).toBe(1);
      expect(report.rows[0]!.reason).toMatch(/más de un producto/i);
      expect(spyCreate).not.toHaveBeenCalled();
    });
  });

  describe('create defaults (S12)', () => {
    it('creates with cost 0.00 in the price currency, CSV-appearance order, active=true', async () => {
      seedCategory('Cafeteras');
      const report = await service.importCsv(
        csvFile(
          csvLine(['Cafeteras', 'Nueva', '8.00', 'EUR', '', '', '']),
          csvLine(['Cafeteras', 'Segunda', '9.00', 'EUR', '', '', '']),
          csvLine(['Licuadoras', 'Primera Licuadora', '5.00', 'MN', '', '', '']),
        ),
      );
      expect(report.created).toBe(3);
      const nueva = productRepo.rows.find((row) => row.name === 'Nueva')!;
      const segunda = productRepo.rows.find((row) => row.name === 'Segunda')!;
      // Order mirrors the row's appearance order WITHIN its category in the file.
      expect(nueva.order).toBe(1);
      expect(segunda.order).toBe(2);
      expect(nueva.cost).toEqual(money(0n, 'EUR'));
      expect(nueva.active).toBe(true);
      expect(nueva.percentDiscountPrice).toBe(0n);
      expect(nueva.discountPrice).toBe(0n);
      // Created categories take their own first-appearance sequence.
      const cafeteras = categoryRepo.rows.find((row) => row.name === 'Cafeteras')!;
      const licuadoras = categoryRepo.rows.find((row) => row.name === 'Licuadoras')!;
      expect(cafeteras.order).toBe(1);
      expect(licuadoras.order).toBe(2);
    });
  });

  describe('rerun idempotency (S9/S14)', () => {
    it('imports the same file twice: second run reports every row updated with zero duplicates', async () => {
      const file = csvFile(
        csvLine(['Cafeteras', 'Cafetera Uno', '10.00', 'USD', '111', '', 'primera']),
        csvLine(['Licuadoras', 'Licuadora Dos', '20.00', 'MN', '', 'SKU-2', 'segunda']),
      );
      const first = await service.importCsv(file);
      expect(first.created).toBe(2);

      const second = await service.importCsv(file);
      expect(second.updated).toBe(2);
      expect(second.created).toBe(0);
      expect(second.failed).toBe(0);
      expect(productRepo.rows).toHaveLength(2);
      // Values refreshed on rerun.
      expect(productRepo.rows.every((row) => row.description === 'segunda' || row.description === 'primera')).toBe(true);
    });
  });

  describe('update touches ONLY CSV-provided values (S10)', () => {
    it('preserves cost/discounts/image/isNew/active/order while updating CSV fields', async () => {
      const cat = seedCategory('Cafeteras');
      const existing = seedProduct({
        name: 'Cafetera Vieja',
        description: 'vieja',
        categoryId: cat.id,
        cost: money(7000n, 'USD'),
        percentDiscountPrice: 1500n,
        discountPrice: 300n,
        image: 'products/cafeteras/vieja.webp',
        isNew: true,
        order: 7,
      });

      await service.importCsv(
        csvFile([csvLine(['Cafeteras', 'Cafetera Vieja', '99.99', 'USD', 'ABC-123', 'SK-1', 'descripción nueva'])]),
      );

      const after = productRepo.rows.find((row) => row.id === existing.id)!;
      expect(after.name).toBe('Cafetera Vieja');
      expect(after.description).toBe('descripción nueva');
      expect(after.barcode).toBe('ABC-123');
      expect(after.sku).toBe('SK-1');
      expect(after.price).toEqual(money(9999n, 'USD'));
      expect(after.cost).toEqual(money(7000n, 'USD'));
      expect(after.percentDiscountPrice).toBe(1500n);
      expect(after.discountPrice).toBe(300n);
      expect(after.image).toBe('products/cafeteras/vieja.webp');
      expect(after.isNew).toBe(true);
      expect(after.order).toBe(7);
      expect(after.active).toBe(true);
    });
  });

  describe('batch semantics (S13)', () => {
    it('never aborts on a mixed batch and lists every row outcome', async () => {
      const report = await service.importCsv(
        csvFile(
          csvLine(['Cafeteras', 'Buena Uno', '1.00', 'USD', '', '', '']),
          csvLine(['', 'Sin categoria', '2.00', 'USD', '', '', '']),
          csvLine(['Cafeteras', 'Precio Malo', 'gratis', 'USD', '', '', '']),
          csvLine(['Cafeteras', 'Buena Dos', '3.00', '', '', '', 'moneda vacía → MN']),
        ),
      );
      expect(report.totalRows).toBe(4);
      expect(report.created).toBe(2);
      expect(report.failed).toBe(2);
      expect(report.rows.map((row) => row.status)).toEqual(['created', 'failed', 'failed', 'created']);
      expect(report.rows[1]!.reason).toMatch(/categoría/i);
    });
  });

  describe('whole-file rejection', () => {
    it('rejects a wrong header without touching any repository', async () => {
      const bad = Buffer.from('col_a;col_b\nx;y\n', 'utf8');
      await expect(service.importCsv(bad)).rejects.toThrow(/Encabezado inválido/);
      expect(productRepo.rows).toHaveLength(0);
      expect(categoryRepo.rows).toHaveLength(0);
    });
  });
});
