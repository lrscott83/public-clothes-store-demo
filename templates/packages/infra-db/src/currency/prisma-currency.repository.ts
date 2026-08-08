import { Injectable } from '@nestjs/common';
import type {
  AppendRateInput,
  ExchangeRate as DomainExchangeRate,
  ICurrencyRepository,
  PaymentChannel,
} from '@store-mgmt/domain';
import { rateFromDecimalString, rateToDecimalString } from '@store-mgmt/domain';
import { TenantContextService } from '../tenant/tenant-context.service.js';

/** Shape shared by every row Prisma returns for the `ExchangeRate` model. */
interface ExchangeRateRow {
  readonly id: string;
  readonly channel: string;
  readonly rate: { toString(): string };
  readonly effectiveFrom: Date;
}

/** Every row Prisma returns is persisted, so `id` is always set here. */
function toDomain(row: ExchangeRateRow): DomainExchangeRate {
  return {
    id: row.id,
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
 *
 * Client source: `TenantContextService.getClient()` (design.md D2/D5), not a
 * directly-injected Prisma client. Every method resolves the client fresh —
 * never cached on `this` — because the AsyncLocalStorage-scoped tenant
 * context can differ per call; caching it at construction would freeze the
 * repository to whichever tenant happened to be active when Nest built it.
 */
@Injectable()
export class PrismaCurrencyRepository implements ICurrencyRepository {
  constructor(private readonly tenantContext: TenantContextService) {}

  async appendRate(input: AppendRateInput): Promise<DomainExchangeRate> {
    const row = await this.tenantContext.getClient().exchangeRate.create({
      data: {
        channel: input.channel,
        rate: rateToDecimalString(input.rate),
        effectiveFrom: input.effectiveFrom,
      },
    });
    return toDomain(row);
  }

  async ratesForChannel(channel: PaymentChannel, at?: Date): Promise<DomainExchangeRate[]> {
    const rows = await this.tenantContext.getClient().exchangeRate.findMany({
      where: {
        channel,
        ...(at ? { effectiveFrom: { lte: at } } : {}),
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    return rows.map(toDomain);
  }

  async latestRate(channel: PaymentChannel, at: Date): Promise<DomainExchangeRate | null> {
    const row = await this.tenantContext.getClient().exchangeRate.findFirst({
      where: { channel, effectiveFrom: { lte: at } },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });
    return row ? toDomain(row) : null;
  }
}
