import { describe, it, expect } from 'vitest';
import { CHANNEL_CURRENCY, PAYMENT_CHANNEL_LABELS_ES, getPaymentChannelLabel } from './payment-channel.js';
import type { PaymentChannel } from './payment-channel.js';

describe('CHANNEL_CURRENCY', () => {
  it('covers exactly the 5 confirmed channels', () => {
    expect(Object.keys(CHANNEL_CURRENCY).sort()).toEqual(
      [
        'EUR_CASH',
        'MN_CASH',
        'MN_TRANSFER',
        'USD_CASH',
        'ZELLE',
      ].sort(),
    );
  });

  it('maps ZELLE and USD_CASH to USD', () => {
    expect(CHANNEL_CURRENCY.ZELLE).toBe('USD');
    expect(CHANNEL_CURRENCY.USD_CASH).toBe('USD');
  });

  it('maps EUR_CASH to EUR', () => {
    expect(CHANNEL_CURRENCY.EUR_CASH).toBe('EUR');
  });

  it('maps MN_TRANSFER and MN_CASH to MN', () => {
    expect(CHANNEL_CURRENCY.MN_TRANSFER).toBe('MN');
    expect(CHANNEL_CURRENCY.MN_CASH).toBe('MN');
  });

  it('an unrecognized channel is a compile-time type error, never a runtime default', () => {
    // @ts-expect-error 'BITCOIN' is not a member of PaymentChannel — tsc must reject
    // this, proving unknown channels can never silently resolve to a default value.
    const invalid: PaymentChannel = 'BITCOIN';
    expect(invalid).toBe('BITCOIN');
  });
});

describe('PAYMENT_CHANNEL_LABELS_ES / getPaymentChannelLabel', () => {
  it('covers every PaymentChannel with the neutral LatAm Spanish label (owner-approved)', () => {
    expect(PAYMENT_CHANNEL_LABELS_ES.ZELLE).toBe('Zelle');
    expect(PAYMENT_CHANNEL_LABELS_ES.USD_CASH).toBe('USD en efectivo');
    expect(PAYMENT_CHANNEL_LABELS_ES.EUR_CASH).toBe('EUR en efectivo');
    expect(PAYMENT_CHANNEL_LABELS_ES.MN_CASH).toBe('MN en efectivo');
    expect(PAYMENT_CHANNEL_LABELS_ES.MN_TRANSFER).toBe('Transferencia en MN');
  });

  it('getPaymentChannelLabel looks up the same map', () => {
    expect(getPaymentChannelLabel('ZELLE')).toBe('Zelle');
    expect(getPaymentChannelLabel('MN_TRANSFER')).toBe('Transferencia en MN');
  });
});
