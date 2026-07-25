import { randomUUID } from 'node:crypto';
import type { Currency, Money } from '../currency/money.js';
import type { PaymentChannel } from '../currency/payment-channel.js';
import { CHANNEL_CURRENCY } from '../currency/payment-channel.js';
import type { ExchangeRate } from '../currency/exchange-rate.js';
import { convert } from '../currency/rate-resolver.js';
import { InvalidOrderError } from './errors.js';

/**
 * A single entry in `Order`'s split multi-channel payment collection (0..N
 * per order). `amount` is in `CHANNEL_CURRENCY[channel]`; `amountInOrderCurrency`
 * is the frozen conversion into `Order.currency`. Invariant enforced by the
 * `Order` factory: `Σ amountInOrderCurrency === Order.total`.
 */
export interface OrderPayment {
  readonly id: string;
  readonly channel: PaymentChannel;
  readonly amount: Money;
  readonly rateApplied: ExchangeRate;
  readonly rateEffectiveFrom: Date;
  readonly amountInOrderCurrency: Money;
}

export interface BuildOrderPaymentInput {
  readonly channel: PaymentChannel;
  readonly amount: Money;
}

/**
 * Builds a frozen `OrderPayment` snapshot. Throws `InvalidOrderError` when
 * `amount.currency` does not match the channel's fixed settlement currency,
 * or when `amount` is not strictly positive. Cross-currency conversion with
 * no resolvable rate propagates `RateNotFoundError` from `convert`
 * unchanged — this function never catches it.
 */
export function buildOrderPayment(
  input: BuildOrderPaymentInput,
  orderCurrency: Currency,
  rates: ExchangeRate[],
  at: Date,
): OrderPayment {
  if (input.amount.currency !== CHANNEL_CURRENCY[input.channel]) {
    throw new InvalidOrderError(
      `Payment channel "${input.channel}" settles in ${CHANNEL_CURRENCY[input.channel]}, but amount is ${input.amount.currency}`,
    );
  }
  if (input.amount.minorUnits <= 0n) {
    throw new InvalidOrderError('OrderPayment amount must be greater than 0');
  }

  const { money: amountInOrderCurrency, rateApplied } = convert(
    rates,
    input.amount,
    input.channel,
    orderCurrency,
    at,
  );

  return {
    id: randomUUID(),
    channel: input.channel,
    amount: input.amount,
    rateApplied,
    rateEffectiveFrom: rateApplied.effectiveFrom,
    amountInOrderCurrency,
  };
}
