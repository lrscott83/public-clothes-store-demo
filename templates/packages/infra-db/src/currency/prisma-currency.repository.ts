import { Injectable } from '@nestjs/common';
import type {
  AppendRateInput,
  ExchangeRate as DomainExchangeRate,
  ICurrencyRepository,
  PaymentChannel,
} from '@store-mgmt/domain';
import { rateFromDecimalString, rateToDecimalString } from '@store-mgmt/domain';
import { PrismaService } from '../prisma-client.js';

/** Shape shared by every row Prisma returns for the `ExchangeRate` model. */
interface ExchangeRateRow {
  readonly channel: string;
  readonly rate: { toString(): string };
  readonly effectiveFrom: Date;
}

function toDomain(row: ExchangeRateRow): DomainExchangeRate {
  return {
    channel: row.channel as PaymentChannel,
    rate: rateFromDecimalString(row.rate.toString()),
    effectiveFrom: row.effectiveFrom,
  };
}

/**
 * Prisma adapter for `ICurrencyRepository`. Maps the Prisma `Decimal`
 * (`Decimal(18,6)`) column <-> the domain's scaled `bigint` at `RATE_SCALE`.
 * Exposes ONLY append + read — no update/delete method exists, so a rate
 * change is structurally always a new INSERT, never an UPDATE.
 */
@Injectable()
export class PrismaCurrencyRepository implements ICurrencyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async appendRate(input: AppendRateInput): Promise<DomainExchangeRate> {
    const row = await this.prisma.exchangeRate.create({
      data: {
        channel: input.channel,
        rate: rateToDecimalString(input.rate),
        effectiveFrom: input.effectiveFrom,
      },
    });
    return toDomain(row);
  }

  async ratesForChannel(channel: PaymentChannel, at?: Date): Promise<DomainExchangeRate[]> {
    const rows = await this.prisma.exchangeRate.findMany({
      where: {
        channel,
        ...(at ? { effectiveFrom: { lte: at } } : {}),
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    return rows.map(toDomain);
  }

  async latestRate(channel: PaymentChannel, at: Date): Promise<DomainExchangeRate | null> {
    const row = await this.prisma.exchangeRate.findFirst({
      where: { channel, effectiveFrom: { lte: at } },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });
    return row ? toDomain(row) : null;
  }
}
