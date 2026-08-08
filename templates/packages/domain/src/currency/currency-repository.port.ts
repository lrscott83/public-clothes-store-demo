import type { PaymentChannel } from './payment-channel.js';
import type { ExchangeRate } from './exchange-rate.js';

/** Input for appending a new (immutable) rate row. */
export interface AppendRateInput {
  readonly channel: PaymentChannel;
  readonly rate: bigint;
  readonly effectiveFrom: Date;
}

/**
 * Port for reading/appending currencies, channels and rates. Zero dependency
 * on any persistence technology — domain code imports this interface, never a
 * concrete Prisma class. Append-only by shape: no update/delete method exists.
 */
export interface ICurrencyRepository {
  appendRate(input: AppendRateInput): Promise<ExchangeRate>;
  ratesForChannel(channel: PaymentChannel, at?: Date): Promise<ExchangeRate[]>;
  latestRate(channel: PaymentChannel, at: Date): Promise<ExchangeRate | null>;
}

/** DI token for `ICurrencyRepository` — consumers inject by this symbol. */
export const CURRENCY_REPOSITORY = Symbol('ICurrencyRepository');
