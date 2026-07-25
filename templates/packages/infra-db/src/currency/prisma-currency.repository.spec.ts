import { rateFromDecimalString } from '@store-mgmt/domain';
import { PrismaService } from '../prisma-client.js';
import { PrismaCurrencyRepository } from './prisma-currency.repository.js';

/**
 * Integration tests against the real `store_mgmt` Postgres database (no
 * mocks): they exercise the actual Prisma <-> Decimal <-> bigint mapping and
 * the append-only guarantee at the SQL level, per design.md's testing
 * strategy for infra-db (jest + real Postgres).
 */
describe('PrismaCurrencyRepository', () => {
  let prisma: PrismaService;
  let repository: PrismaCurrencyRepository;

  beforeAll(() => {
    prisma = new PrismaService();
    repository = new PrismaCurrencyRepository(prisma);
  });

  afterEach(async () => {
    // Full cleanup keeps every test isolated regardless of which of the 5
    // fixed enum channels it used.
    await prisma.exchangeRate.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('appendRate() is append-only: calling it twice for the same channel inserts 2 rows, never an UPDATE', async () => {
    await repository.appendRate({
      channel: 'ZELLE',
      rate: 350455000n,
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    });
    await repository.appendRate({
      channel: 'ZELLE',
      rate: 360000000n,
      effectiveFrom: new Date('2026-02-01T00:00:00.000Z'),
    });

    const rows = await prisma.exchangeRate.findMany({ where: { channel: 'ZELLE' } });

    expect(rows).toHaveLength(2);
    // Prisma's `Decimal.toString()` normalizes trailing zeros (e.g. "360"
    // instead of "360.000000"); compare via the domain's bigint parser so the
    // assertion reflects DB precision, not string formatting.
    expect(rows.map((r) => rateFromDecimalString(r.rate.toString())).sort()).toEqual(
      [350455000n, 360000000n].sort(),
    );
  });

  it('latestRate(channel, at) returns the latest row with effectiveFrom <= at, ignoring a later row', async () => {
    await repository.appendRate({
      channel: 'ZELLE',
      rate: 350455000n,
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    });
    await repository.appendRate({
      channel: 'ZELLE',
      rate: 400123456n,
      effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
    });

    const resolved = await repository.latestRate('ZELLE', new Date('2026-02-15T00:00:00.000Z'));

    expect(resolved).not.toBeNull();
    expect(resolved?.rate).toBe(350455000n);
    expect(resolved?.effectiveFrom.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('appendRate() returns the persisted row with its DB-generated UUID id', async () => {
    const appended = await repository.appendRate({
      channel: 'ZELLE',
      rate: 350455000n,
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(appended.id).toEqual(expect.any(String));
    expect(appended.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('latestRate() and ratesForChannel() carry the persisted row id through, distinct per row', async () => {
    const first = await repository.appendRate({
      channel: 'ZELLE',
      rate: 350455000n,
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    });
    const second = await repository.appendRate({
      channel: 'ZELLE',
      rate: 360000000n,
      effectiveFrom: new Date('2026-02-01T00:00:00.000Z'),
    });

    const latest = await repository.latestRate('ZELLE', new Date('2026-02-15T00:00:00.000Z'));
    expect(latest?.id).toBe(second.id);
    expect(latest?.id).not.toBe(first.id);

    const rows = await repository.ratesForChannel('ZELLE');
    expect(rows.map((r) => r.id).sort()).toEqual([first.id, second.id].sort());
  });

  it('preserves Decimal <-> bigint fidelity at RATE_SCALE=6 across an append + read round-trip', async () => {
    const rate = 350455123n; // "350.455123" — exercises all 6 decimal places

    const appended = await repository.appendRate({
      channel: 'MN_CASH',
      rate,
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(appended.rate).toBe(rate);

    const resolved = await repository.latestRate('MN_CASH', new Date('2026-01-02T00:00:00.000Z'));

    expect(resolved?.rate).toBe(rate);
  });

  it('ratesForChannel(channel) returns every appended row for that channel, ordered by effectiveFrom desc', async () => {
    await repository.appendRate({
      channel: 'EUR_CASH',
      rate: 300000000n,
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    });
    await repository.appendRate({
      channel: 'EUR_CASH',
      rate: 310000000n,
      effectiveFrom: new Date('2026-02-01T00:00:00.000Z'),
    });

    const rows = await repository.ratesForChannel('EUR_CASH');

    expect(rows).toHaveLength(2);
    expect(rows[0]?.rate).toBe(310000000n);
    expect(rows[1]?.rate).toBe(300000000n);
  });
});
