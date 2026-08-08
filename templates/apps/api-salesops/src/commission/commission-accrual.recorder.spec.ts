import { Test, TestingModule } from '@nestjs/testing';
import {
  COMMISSION_ACCRUAL_REPOSITORY,
  COMMISSION_REFERENCE_PROVIDER,
  money,
  moneyToDecimalString,
  type Order,
} from '@store-mgmt/domain';
import { CommissionAccrualRecorder } from './commission-accrual.recorder.js';

type RepoMock = Record<string, jest.Mock>;

const AGENT = 'company-user-agent';

/** Only the fields accrual reads — the rest of `Order` is irrelevant to commission. */
function anOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    status: 'delivered',
    attributedCompanyUserId: AGENT,
    lines: [
      { id: 'line-1', productId: 'p-300', quantity: 2 },
      { id: 'line-2', productId: 'p-200', quantity: 1 },
    ],
    ...overrides,
  } as unknown as Order;
}

describe('CommissionAccrualRecorder', () => {
  let recorder: CommissionAccrualRecorder;
  let accrualRepository: RepoMock;
  let referenceProvider: RepoMock;
  let logSpy: jest.SpyInstance;

  beforeEach(async () => {
    accrualRepository = {
      create: jest.fn().mockImplementation(async (accrual) => accrual),
      findByOrderId: jest.fn().mockResolvedValue(null),
    };
    referenceProvider = {
      commissionsFor: jest.fn().mockResolvedValue(
        new Map([
          ['p-300', money(30000n, 'MN')],
          ['p-200', money(20000n, 'MN')],
        ]),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommissionAccrualRecorder,
        { provide: COMMISSION_ACCRUAL_REPOSITORY, useValue: accrualRepository },
        { provide: COMMISSION_REFERENCE_PROVIDER, useValue: referenceProvider },
      ],
    }).compile();

    recorder = module.get(CommissionAccrualRecorder);
    logSpy = jest.spyOn(recorder['logger'], 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  // R13
  it('creates exactly one accrual for a delivered order', async () => {
    const accrual = await recorder.recordForDeliveredOrder(anOrder());

    expect(accrual).not.toBeNull();
    expect(moneyToDecimalString(accrual!.total)).toBe('800.00');
    expect(accrualRepository.create).toHaveBeenCalledTimes(1);
  });

  it('is idempotent — a second delivery returns the existing accrual and writes nothing', async () => {
    const existing = { id: 'accrual-1', orderId: 'order-1' };
    accrualRepository.findByOrderId.mockResolvedValue(existing);

    const result = await recorder.recordForDeliveredOrder(anOrder());

    expect(result).toBe(existing);
    expect(accrualRepository.create).not.toHaveBeenCalled();
  });

  // R13 — the legacy path.
  it('records NOTHING for an unattributed order, and says so out loud', async () => {
    const result = await recorder.recordForDeliveredOrder(
      anOrder({ attributedCompanyUserId: null }),
    );

    expect(result).toBeNull();
    expect(accrualRepository.create).not.toHaveBeenCalled();
    // Crediting a guessed agent would fabricate a financial record, so the
    // only honest outcome is to decline — but silently declining would hide a
    // real gap in the data, hence the log.
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('UNATTRIBUTED_ORDER'));
  });

  // R15 — no new guard code; the trigger simply is not reachable from any
  // other status, and this pins that.
  it.each(['created', 'verified', 'cancelled'])(
    'refuses to accrue for a %s order',
    async (status) => {
      const result = await recorder.recordForDeliveredOrder(
        anOrder({ status } as unknown as Partial<Order>),
      );

      expect(result).toBeNull();
      expect(accrualRepository.create).not.toHaveBeenCalled();
    },
  );

  // R18 — D9: whether the customer has finished paying is irrelevant to
  // whether the agent earned the commission.
  it('accrues identically for a fully-paid and a credit-pending order', async () => {
    const fullyPaid = await recorder.recordForDeliveredOrder(
      anOrder({ saleCredit: null } as unknown as Partial<Order>),
    );
    accrualRepository.create.mockClear();
    const onCredit = await recorder.recordForDeliveredOrder(
      anOrder({
        saleCredit: { total: money(100000n, 'MN'), paid: money(0n, 'MN') },
      } as unknown as Partial<Order>),
    );

    expect(moneyToDecimalString(fullyPaid!.total)).toBe(moneyToDecimalString(onCredit!.total));
    expect(moneyToDecimalString(onCredit!.total)).toBe('800.00');
  });

  it('carries an unconfigured product through as unresolved, never as zero', async () => {
    referenceProvider.commissionsFor.mockResolvedValue(new Map([['p-300', money(30000n, 'MN')]]));

    const accrual = await recorder.recordForDeliveredOrder(anOrder());

    expect(moneyToDecimalString(accrual!.total)).toBe('600.00');
    expect(accrual!.unresolved).toEqual([
      { orderLineId: 'line-2', productId: 'p-200', quantity: 1 },
    ]);
  });

  it('asks the provider for every line product exactly once', async () => {
    await recorder.recordForDeliveredOrder(anOrder());

    expect(referenceProvider.commissionsFor).toHaveBeenCalledTimes(1);
    expect(referenceProvider.commissionsFor).toHaveBeenCalledWith(['p-300', 'p-200']);
  });
});
