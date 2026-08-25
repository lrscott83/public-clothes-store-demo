import { Inject, Injectable } from '@nestjs/common';
import type {
  Category as DomainCategory,
  Currency,
  ICategoryRepository,
  IProductRepository,
  Product as DomainProduct,
} from '@store-mgmt/domain';
import {
  CATEGORY_REPOSITORY,
  InvalidProductError,
  PRODUCT_REPOSITORY,
  assertValidProductPrice,
  createCategory,
  moneyFromDecimalString,
  parseProductCsv,
  slugify,
  toTitleCase,
} from '@store-mgmt/domain';
import { ProductService } from './product.service.js';
import { MAX_CSV_DATA_ROWS } from '@store-mgmt/domain';

/** Outcome of ONE CSV data row, reported line-by-line to the console. */
export interface ImportRowResult {
  /** 1-based data-row number (the header is not counted). */
  line: number;
  status: 'created' | 'updated' | 'failed';
  /** The normalized product name when one could be derived, else null. */
  name: string | null;
  /** Spanish failure reason; present only when status is 'failed'. */
  reason?: string;
}

/** Whole-batch report consumed by the web console's success state. */
export interface ImportReport {
  totalRows: number;
  created: number;
  updated: number;
  failed: number;
  rows: ImportRowResult[];
}

const VALID_CURRENCIES = new Set<string>(['USD', 'EUR', 'MN']);
const DEFAULT_CURRENCY = 'MN';

/**
 * Idempotent bulk import orchestrator (design.md D3): ONE `list()` read per
 * batch builds in-memory idempotency maps (sku → products, categoryId+name →
 * product, lowercased category name → category); each CSV row then flows
 * through the SAME validated `ProductService.create`/`update` paths the
 * admin CRUD uses, so every domain invariant holds without a second code
 * path. A row's failure never aborts the batch — failures are reported and
 * skipped, and a rerun of the same file converges (created rows become
 * updates). No transactions by design: row-by-row commits plus idempotent
 * keys make a crashed run recoverable by simply re-uploading.
 */
@Injectable()
export class ImportService {
  constructor(
    private readonly productService: ProductService,
    @Inject(PRODUCT_REPOSITORY) private readonly productRepository: IProductRepository,
    @Inject(CATEGORY_REPOSITORY) private readonly categoryRepository: ICategoryRepository,
  ) {}

  async importCsv(buffer: Buffer): Promise<ImportReport> {
    // Whole-file grammar check first — a bad header or oversized file writes nothing.
    // InvalidProductError (not bare Error) so the controller's existing
    // domain-error mapping turns it into a 400 carrying the Spanish reason.
    const parsed = parseProductCsv(buffer, { maxRows: MAX_CSV_DATA_ROWS });
    if (!parsed.ok) {
      throw new InvalidProductError(parsed.reason);
    }

    // One read per batch → snapshot maps for O(1) idempotency lookups.
    const [products, categories] = await Promise.all([
      this.productRepository.list({ includeInactive: true }),
      this.categoryRepository.list({ includeInactive: true }),
    ]);

    const categoriesByLowerName = new Map<string, DomainCategory>();
    for (const category of categories) {
      categoriesByLowerName.set(category.name.toLowerCase(), category);
    }
    const usedSlugs = new Set(categories.map((category) => category.slug));

    const productsBySku = new Map<string, DomainProduct[]>();
    const productsByKey = new Map<string, DomainProduct>();
    for (const product of products) {
      if (product.sku) {
        const bucket = productsBySku.get(product.sku.toLowerCase()) ?? [];
        bucket.push(product);
        productsBySku.set(product.sku.toLowerCase(), bucket);
      }
      productsByKey.set(this.productKey(product.categoryId, product.name), product);
    }

    // `order` comes from the CSV's own appearance order (owner decision):
    // products count per category within this file; categories count their
    // first reference — existing or newly created. Existing rows are never
    // reordered: order is only assigned on CREATE.
    const csvOrderByCategory = new Map<string, number>();
    const categoryCsvOrderByLowerName = new Map<string, number>();
    let csvCategorySequence = 0;

    const rows: ImportRowResult[] = [];
    let created = 0;
    let updated = 0;
    let failed = 0;

    for (let index = 0; index < parsed.rows.length; index += 1) {
      const csvRow = parsed.rows[index]!;
      const line = index + 1;
      try {
        const outcome = await this.importRow(csvRow, {
          categoriesByLowerName,
          usedSlugs,
          productsBySku,
          productsByKey,
          csvOrderByCategory,
          categoryCsvOrderByLowerName,
          nextCategoryOrder: () => ++csvCategorySequence,
        });
        if (outcome === 'created') created += 1;
        else updated += 1;
        rows.push({ line, status: outcome, name: toTitleCase(csvRow.nombre.trim()) });
      } catch (error) {
        failed += 1;
        rows.push({
          line,
          status: 'failed',
          name: csvRow.nombre.trim() ? toTitleCase(csvRow.nombre.trim()) : null,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { totalRows: parsed.rows.length, created, updated, failed, rows };
  }

  private async importRow(
    csvRow: Record<string, string>,
    context: {
      categoriesByLowerName: Map<string, DomainCategory>;
      usedSlugs: Set<string>;
      productsBySku: Map<string, DomainProduct[]>;
      productsByKey: Map<string, DomainProduct>;
      csvOrderByCategory: Map<string, number>;
      categoryCsvOrderByLowerName: Map<string, number>;
      nextCategoryOrder: () => number;
    },
  ): Promise<'created' | 'updated'> {
    const rawCategory = csvRow['categoria']!.trim();
    const rawName = csvRow['nombre']!.trim();
    if (!rawCategory) {
      throw new Error('La categoría es obligatoria.');
    }
    if (!rawName) {
      throw new Error('El nombre del producto es obligatorio.');
    }

    const currencyRaw = csvRow['moneda']!.trim().toUpperCase();
    const currency = (currencyRaw || DEFAULT_CURRENCY) as Currency;
    if (!VALID_CURRENCIES.has(currency)) {
      throw new Error(`Moneda inválida "${currencyRaw}". Valores permitidos: USD, EUR, MN.`);
    }

    const priceRaw = csvRow['precio']!.trim();
    if (!priceRaw || !/^\d+(\.\d{1,2})?$/.test(priceRaw)) {
      throw new Error(`Precio inválido: "${priceRaw}". Usá un número mayor que cero con hasta dos decimales.`);
    }
    const price = moneyFromDecimalString(priceRaw, currency);
    assertValidProductPrice(price);

    // Camel Case is the canonical stored form for BOTH names — matching and writing.
    const categoryName = toTitleCase(rawCategory);
    const productName = toTitleCase(rawName);

    // Category appearance sequence counts EVERY category the CSV references,
    // existing or not — so a newly created category lands at the position its
    // name first appears in the file (Cafeteras=1 even if it pre-existed,
    // Licuadoras=2…). Only CREATED categories persist this value.
    const categoryLookupKey = rawCategory.toLowerCase();
    let categoryCsvOrder = context.categoryCsvOrderByLowerName.get(categoryLookupKey);
    if (categoryCsvOrder === undefined) {
      categoryCsvOrder = context.nextCategoryOrder();
      context.categoryCsvOrderByLowerName.set(categoryLookupKey, categoryCsvOrder);
    }

    const category = await this.resolveOrCreateCategory(categoryName, categoryCsvOrder, context);

    // Idempotency key: sku FIRST (priority), falling back to
    // (categoryId + name) when the sku does not exist yet — so importing a
    // sku onto an already-named product UPDATES it instead of duplicating.
    const skuRaw = csvRow['sku']!.trim();
    let existing: DomainProduct | undefined;
    if (skuRaw) {
      const matches = context.productsBySku.get(skuRaw.toLowerCase());
      if (matches && matches.length > 1) {
        throw new Error(`El SKU "${skuRaw}" corresponde a más de un producto existente; corregí los duplicados antes de importar.`);
      }
      existing = matches?.[0];
    }
    if (!existing) {
      existing = context.productsByKey.get(this.productKey(category.id, productName));
    }

    const description = csvRow['descripcion']!;
    const barcode = csvRow['barcode']!.trim();

    if (existing) {
      await this.productService.update(existing.id, {
        name: productName,
        description,
        price: { amount: priceRaw, currency },
        categoryId: category.id,
        ...(skuRaw ? { sku: skuRaw } : {}),
        ...(barcode ? { barcode } : {}),
      });
      // Keep the maps coherent for later rows in this same file.
      context.productsByKey.delete(this.productKey(existing.categoryId, existing.name));
      const refreshed = (await this.productRepository.findById(existing.id))!;
      context.productsByKey.set(this.productKey(category.id, productName), refreshed);
      if (skuRaw) {
        context.productsBySku.set(skuRaw.toLowerCase(), [refreshed]);
      }
      return 'updated';
    }

    // `order` = the row's own appearance order in the CSV, counted per
    // category within this file (first 'Cafeteras' row → 1, second → 2…).
    // Only assigned on CREATE; updates never reorder anything.
    const csvOrderForCategory = (context.csvOrderByCategory.get(category.id) ?? 0) + 1;
    context.csvOrderByCategory.set(category.id, csvOrderForCategory);
    const createdDto = await this.productService.create({
      name: productName,
      description,
      price: { amount: priceRaw, currency },
      cost: { amount: '0.00', currency },
      categoryId: category.id,
      order: csvOrderForCategory,
      active: true,
      ...(skuRaw ? { sku: skuRaw } : {}),
      ...(barcode ? { barcode } : {}),
    });
    // Register the fresh product so a duplicate row LATER IN THIS SAME FILE
    // updates it instead of creating a twin (batch-level idempotency).
    const persisted = (await this.productRepository.findById(createdDto.id))!;
    context.productsByKey.set(this.productKey(category.id, productName), persisted);
    if (skuRaw) {
      context.productsBySku.set(skuRaw.toLowerCase(), [persisted]);
    }
    return 'created';
  }

  /**
   * Case-insensitive category lookup with on-miss creation (slug derived from
   * the Camel Case name, `-N`-suffixed on collision). Newly created categories
   * are registered in ALL local maps so later rows share them within the
   * batch without further I/O.
   */
  private async resolveOrCreateCategory(
    categoryName: string,
    csvOrder: number,
    context: {
      categoriesByLowerName: Map<string, DomainCategory>;
      usedSlugs: Set<string>;
      nextCategoryOrder: () => number;
    },
  ): Promise<DomainCategory> {
    const key = categoryName.toLowerCase();
    const found = context.categoriesByLowerName.get(key);
    if (found) {
      return found;
    }

    const baseSlug = slugify(categoryName);
    if (!baseSlug) {
      throw new Error(`La categoría "${categoryName}" no genera un slug válido.`);
    }
    let slug = baseSlug;
    let suffix = 2;
    while (
      context.usedSlugs.has(slug) ||
       
      (await this.categoryRepository.findBySlug(slug))
    ) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    const created = createCategory({
      name: categoryName,
      slug,
      // `order` = the category's own first-appearance order in the CSV
      // (owner decision), counted across existing AND created categories.
      order: csvOrder,
    });
    const persisted = await this.categoryRepository.create({
      name: created.name,
      slug: created.slug,
      order: created.order,
    });
    context.categoriesByLowerName.set(key, persisted);
    context.usedSlugs.add(persisted.slug);
    return persisted;
  }

  private productKey(categoryId: string, name: string): string {
    return `${categoryId}::${name.toLowerCase()}`;
  }
}
