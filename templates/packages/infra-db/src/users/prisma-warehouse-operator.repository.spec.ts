import { PrismaService } from '../prisma-client.js';
import { PrismaUserRepository } from './prisma-user.repository.js';
import { PrismaWarehouseOperatorRepository } from './prisma-warehouse-operator.repository.js';

const VALID_HASH = '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV';

/**
 * Integration tests against the real `store_mgmt` Postgres database (no
 * mocks) — same discipline as `prisma-user.repository.spec.ts`.
 */
describe('PrismaWarehouseOperatorRepository', () => {
  let prisma: PrismaService;
  let repository: PrismaWarehouseOperatorRepository;
  let users: PrismaUserRepository;
  let warehouseId: string;

  beforeAll(() => {
    prisma = new PrismaService();
    repository = new PrismaWarehouseOperatorRepository(prisma);
    users = new PrismaUserRepository(prisma);
  });

  beforeEach(async () => {
    const warehouse = await prisma.warehouse.create({ data: { name: 'Depósito Operadores Spec' } });
    warehouseId = warehouse.id;
  });

  afterEach(async () => {
    await prisma.warehouseOperator.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.warehouse.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('create() persists a WarehouseOperator row keyed by userId', async () => {
    const user = await users.create({ login: 'op1', passwordHash: VALID_HASH, fullName: 'Operador Uno' });

    const created = await repository.create({ userId: user.id, warehouseId });

    expect(created.userId).toBe(user.id);
    expect(created.warehouseId).toBe(warehouseId);
  });

  it('findByUserId() round-trips a persisted WarehouseOperator', async () => {
    const user = await users.create({ login: 'op2', passwordHash: VALID_HASH, fullName: 'Operador Dos' });
    await repository.create({ userId: user.id, warehouseId });

    const found = await repository.findByUserId(user.id);

    expect(found).not.toBeNull();
    expect(found?.warehouseId).toBe(warehouseId);
  });

  it('findByUserId() returns null when the user has no WarehouseOperator row', async () => {
    const found = await repository.findByUserId('00000000-0000-0000-0000-000000000000');
    expect(found).toBeNull();
  });

  it('findByWarehouseId() returns every operator scoped to a warehouse — NOT unique', async () => {
    const userA = await users.create({ login: 'op3', passwordHash: VALID_HASH, fullName: 'Operador Tres' });
    const userB = await users.create({ login: 'op4', passwordHash: VALID_HASH, fullName: 'Operador Cuatro' });
    await repository.create({ userId: userA.id, warehouseId });
    await repository.create({ userId: userB.id, warehouseId });

    const operators = await repository.findByWarehouseId(warehouseId);

    expect(operators.map((o) => o.userId).sort()).toEqual([userA.id, userB.id].sort());
  });
});
