import { Test, TestingModule } from '@nestjs/testing';
import type { ExchangeRate as DomainExchangeRate, ICurrencyRepository } from '@store-mgmt/domain';
import {
  CURRENCY_REPOSITORY,
  InvalidMoneyError,
  RateNotFoundError,
  convertir,
  moneyFromDecimalString,
  moneyToDecimalString,
  rateToDecimalString,
} from '@store-mgmt/domain';
import { CurrencyService } from './currency.service.js';

function buildRepoMock(): jest.Mocked<ICurrencyRepository> {
  return {
    appendRate: jest.fn(),
    ratesForChannel: jest.fn(),
    latestRate: jest.fn(),
  };
}

describe('CurrencyService', () => {
  let service: CurrencyService;
  let repo: jest.Mocked<ICurrencyRepository>;

  beforeEach(async () => {
    repo = buildRepoMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [CurrencyService, { provide: CURRENCY_REPOSITORY, useValue: repo }],
    }).compile();
    service = module.get(CurrencyService);
  });

  describe('createRate', () => {
    it('maps the repository-appended bigint rate to a decimal string, including the persisted id', async () => {
      const appended: DomainExchangeRate = {
        id: 'rate-uuid-1',
        channel: 'ZELLE',
        rate: 350455000n, // "350.455" at RATE_SCALE=6
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      };
      repo.appendRate.mockResolvedValue(appended);

      const result = await service.createRate({
        channel: 'ZELLE',
        rate: '350.455',
        effectiveFrom: '2026-01-01T00:00:00.000Z',
      });

      expect(result).toEqual({
        id: 'rate-uuid-1',
        channel: 'ZELLE',
        rate: '350.455000',
        effectiveFrom: '2026-01-01T00:00:00.000Z',
      });
      expect(repo.appendRate).toHaveBeenCalledWith({
        channel: 'ZELLE',
        rate: 350455000n,
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      });
    });
  });

  describe('getLatestRate', () => {
    it('maps the resolved bigint rate to a decimal string, including the persisted row id', async () => {
      repo.ratesForChannel.mockImplementation(async (channel) =>
        channel === 'ZELLE'
          ? [
              {
                id: 'rate-uuid-2',
                channel: 'ZELLE',
                rate: 350455000n,
                effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
              },
            ]
          : [],
      );

      const result = await service.getLatestRate('ZELLE', '2026-02-01T00:00:00.000Z');

      expect(result).toEqual({
        id: 'rate-uuid-2',
        channel: 'ZELLE',
        rate: '350.455000',
        effectiveFrom: '2026-01-01T00:00:00.000Z',
      });
    });

    it('resolves the synthetic USD identity pivot (no own row) with id: null — never a fabricated id', async () => {
      repo.ratesForChannel.mockResolvedValue([]);

      const result = await service.getLatestRate('USD_EFECTIVO', '2026-02-01T00:00:00.000Z');

      expect(result.id).toBeNull();
      expect(result.rate).toBe('1.000000');
    });

    it('surfaces RateNotFoundError as a typed exception, never a swallowed 0/null', async () => {
      repo.ratesForChannel.mockResolvedValue([]);

      await expect(
        service.getLatestRate('EUR_EFECTIVO', '2026-02-01T00:00:00.000Z'),
      ).rejects.toBeInstanceOf(RateNotFoundError);
    });
  });

  describe('convert', () => {
    const at = new Date('2026-02-01T00:00:00.000Z');
    const eurRate: DomainExchangeRate = {
      channel: 'EUR_EFECTIVO',
      rate: 920000n,
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    };
    const mnRate: DomainExchangeRate = {
      channel: 'MN_TRANSFERENCIA',
      rate: 350455000n,
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    };

    function mockRatesFor(rates: DomainExchangeRate[]) {
      repo.ratesForChannel.mockImplementation(async (channel) =>
        rates.filter((r) => r.channel === channel),
      );
    }

    it('maps the pure resolverTasa/convertir result to decimal strings (matches direct domain call)', async () => {
      mockRatesFor([eurRate, mnRate]);

      const expected = convertir(
        [eurRate, mnRate],
        moneyFromDecimalString('100.00', 'EUR'),
        'EUR_EFECTIVO',
        'MN',
        at,
      );

      const result = await service.convert({
        amount: '100.00',
        from: 'EUR',
        channel: 'EUR_EFECTIVO',
        to: 'MN',
        at: at.toISOString(),
      });

      expect(result).toEqual({
        amount: moneyToDecimalString(expected.money),
        currency: 'MN',
        rateApplied: rateToDecimalString(expected.rateApplied.rate),
        effectiveFrom: expected.rateApplied.effectiveFrom.toISOString(),
      });
    });

    it('surfaces RateNotFoundError when no rate is resolvable, never 0/null', async () => {
      mockRatesFor([]);

      await expect(
        service.convert({
          amount: '100.00',
          from: 'EUR',
          channel: 'EUR_EFECTIVO',
          to: 'MN',
          at: at.toISOString(),
        }),
      ).rejects.toBeInstanceOf(RateNotFoundError);
    });

    it('propagates InvalidMoneyError for a malformed decimal amount without touching the repository', async () => {
      await expect(
        service.convert({
          amount: 'not-a-number',
          from: 'USD',
          channel: 'ZELLE',
          to: 'MN',
          at: at.toISOString(),
        }),
      ).rejects.toBeInstanceOf(InvalidMoneyError);
      expect(repo.ratesForChannel).not.toHaveBeenCalled();
    });
  });
});
