import { randomUUID } from 'node:crypto';
import { PrismaMasterService } from '../master-prisma-client.js';
import { useTenantSchema } from '../tenant-schema.spec-helper.js';
import { copyCatalog } from './copy-catalog.js';

/**
 * Integration test against a REAL provisioned tenant schema
 * (`useTenantSchema()`, Phase 5/P12 Option C) and the real master schema
 * (`store_mgmt_test`, `PrismaMasterService`) — no mocks. This is the exact
 * primitive design.md D7 step 6 awaits during provisioning (P9's landmine:
 * poolops's `void seedNewCompany(...)` is a fire-and-forget that leaves a
 * real window with an owner and an empty catalog; `copyCatalog` returns a
 * `Promise` with no floating call anywhere in this file, so the caller is
 * structurally forced to await it).
 */
describe('copyCatalog', () => {
  let master: PrismaMasterService;
  const getTenantSchema = useTenantSchema();

  beforeAll(() => {
    master = new PrismaMasterService();
  });

  afterEach(async () => {
    await master.templateProduct.deleteMany({});
    await master.templateCategory.deleteMany({});
  });

  afterAll(async () => {
    await master.$disconnect();
  });

  async function seedTemplates(): Promise<{ categoryId: string; productId: string }> {
    const suffix = randomUUID();
    const category = await master.templateCategory.create({
      data: { name: `Cafeteras ${suffix}`, slug: `cafeteras-${suffix}`, order: 1, active: true },
    });
    const product = await master.templateProduct.create({
      data: {
        name: `Cafetera ${suffix}`,
        description: '6 tazas',
        price: '15.00',
        priceCurrency: 'USD',
        cost: '9.00',
        costCurrency: 'USD',
        categoryId: category.id,
        image: 'products/cafeteras/cafeteras1.jpeg',
        order: 1,
        active: true,
      },
    });
    return { categoryId: category.id, productId: product.id };
  }

  it('copies TemplateCategory/TemplateProduct rows into the tenant schema', async () => {
    const { categoryId, productId } = await seedTemplates();
    const { client: tenant } = getTenantSchema();

    const result = await copyCatalog(master, tenant);

    expect(result.categoriesCopied).toBe(1);
    expect(result.productsCopied).toBe(1);

    const tenantCategory = await tenant.category.findUnique({ where: { id: categoryId } });
    const tenantProduct = await tenant.product.findUnique({ where: { id: productId } });
    expect(tenantCategory).not.toBeNull();
    expect(tenantProduct).not.toBeNull();
    expect(tenantProduct?.categoryId).toBe(categoryId);
  });

  it('is idempotent — running it twice does not duplicate rows', async () => {
    await seedTemplates();
    const { client: tenant } = getTenantSchema();

    await copyCatalog(master, tenant);
    const afterFirstRun = await tenant.category.count();
    const second = await copyCatalog(master, tenant);

    expect(second.categoriesCopied).toBe(1);
    expect(second.productsCopied).toBe(1);
    // Same tenant schema is shared across this suite's tests (one schema
    // per `describe`, `useTenantSchema()`), so leftover rows from earlier
    // tests may already be present — assert the SECOND run added nothing
    // new, not an absolute count.
    await expect(tenant.category.count()).resolves.toBe(afterFirstRun);
  });

  it('produces independent rows — editing the tenant copy never touches the master template', async () => {
    const { categoryId } = await seedTemplates();
    const { client: tenant } = getTenantSchema();
    await copyCatalog(master, tenant);

    await tenant.category.update({ where: { id: categoryId }, data: { name: 'Edited in tenant' } });

    const masterTemplate = await master.templateCategory.findUnique({ where: { id: categoryId } });
    expect(masterTemplate?.name).not.toBe('Edited in tenant');
  });
});
