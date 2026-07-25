import { describe, it, expect } from 'vitest';
import { createOrder, confirmOrder, deliverOrder, cancelOrder } from './order.js';
import type { CreateOrderInput } from './order.js';
import { InvalidOrderError, InvalidOrderStateError } from './errors.js';
import { RateNotFoundError } from '../currency/errors.js';
import { money } from '../currency/money.js';
import type { BuildOrderLineInput } from './order-line.js';
import type { BuildOrderPaymentInput } from './order-payment.js';
import type { ExchangeRate } from '../currency/exchange-rate.js';

const AT = new Date('2026-07-22T00:00:00Z');

function usdLine(overrides: Partial<BuildOrderLineInput> = {}): BuildOrderLineInput {
  return {
    productId: 'product-1',
    productName: 'Producto A',
    categoryName: 'Categoria A',
    price: money(10000n, 'USD'), // 100.00 USD
    quantity: 1,
    ...overrides,
  };
}

function usdPayment(overrides: Partial<BuildOrderPaymentInput> = {}): BuildOrderPaymentInput {
  return { channel: 'ZELLE', amount: money(10000n, 'USD'), ...overrides };
}

function baseInput(overrides: Partial<CreateOrderInput> = {}): CreateOrderInput {
  return {
    customerId: 'customer-1',
    customerName: 'Ana Torres',
    warehouseId: 'warehouse-1',
    deliveryMode: 'pickup',
    lines: [usdLine()],
    payments: [usdPayment()],
    ...overrides,
  };
}

describe('createOrder — currency derivation, deliveryMode, initial status (3.7)', () => {
  it('any USD line forces order currency to USD, even mixed with an MN line', () => {
    const rates: ExchangeRate[] = [
      {
        channel: 'MN_TRANSFER',
        rate: 350000000n, // 1 USD = 350.000000 MN
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
        id: 'rate-mn',
      },
    ];
    const order = createOrder(
      baseInput({
        lines: [
          usdLine(),
          {
            productId: 'product-2',
            productName: 'Producto B',
            categoryName: 'Categoria B',
            price: money(3500000n, 'MN'), // 35,000.00 MN -> converts to 100.00 USD @350
            quantity: 1,
          },
        ],
        payments: [usdPayment({ amount: money(20000n, 'USD') })],
      }),
      rates,
      AT,
    );
    expect(order.currency).toBe('USD');
    expect(order.total.currency).toBe('USD');
    expect(order.total.minorUnits).toBe(20000n);
    expect(order.lines).toHaveLength(2);
  });

  it('all-MN/EUR lines (no USD line) derive MN', () => {
    const rates: ExchangeRate[] = [
      {
        channel: 'EUR_CASH',
        rate: 1000000n, // EUR at parity with USD
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
        id: 'rate-eur',
      },
      {
        channel: 'MN_TRANSFER',
        rate: 300000000n, // 1 USD = 300.000000 MN
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
        id: 'rate-mn',
      },
    ];
    const order = createOrder(
      baseInput({
        lines: [
          {
            productId: 'product-1',
            productName: 'Producto MN',
            categoryName: 'Categoria A',
            price: money(60000n, 'MN'), // 600.00 MN
            quantity: 1,
          },
          {
            productId: 'product-2',
            productName: 'Producto EUR',
            categoryName: 'Categoria B',
            price: money(10000n, 'EUR'), // 100.00 EUR -> 30000.00 MN @300
            quantity: 1,
          },
        ],
        payments: [{ channel: 'MN_CASH', amount: money(3060000n, 'MN') }],
      }),
      rates,
      AT,
    );
    expect(order.currency).toBe('MN');
    expect(order.total.minorUnits).toBe(3060000n);
  });

  it('requires at least one line', () => {
    expect(() => createOrder(baseInput({ lines: [] }), [], AT)).toThrow(InvalidOrderError);
  });

  it('rejects a missing deliveryMode', () => {
    expect(() =>
      createOrder(baseInput({ deliveryMode: undefined as unknown as 'pickup' }), [], AT),
    ).toThrow(InvalidOrderError);
  });

  it('rejects an invalid deliveryMode', () => {
    expect(() =>
      createOrder(baseInput({ deliveryMode: 'transportando' as unknown as 'pickup' }), [], AT),
    ).toThrow(InvalidOrderError);
  });

  it('starts life in status created, with no verifiedAt/deliveredAt stamped', () => {
    const order = createOrder(baseInput(), [], AT);
    expect(order.status).toBe('created');
    expect(order.verifiedAt).toBeNull();
    expect(order.deliveredAt).toBeNull();
  });
});

describe('createOrder — totals derived from lines, payment-sum invariant (3.8)', () => {
  it('ignores an explicit total input and always recomputes from lines', () => {
    const order = createOrder(baseInput({ total: money(999999n, 'USD') }), [], AT);
    expect(order.total.minorUnits).toBe(10000n);
  });

  it('rejects when the payment sum is less than the derived total', () => {
    expect(() =>
      createOrder(
        baseInput({ payments: [usdPayment({ amount: money(5000n, 'USD') })] }),
        [],
        AT,
      ),
    ).toThrow(InvalidOrderError);
  });

  it('rejects when the payment sum exceeds the derived total', () => {
    expect(() =>
      createOrder(
        baseInput({ payments: [usdPayment({ amount: money(15000n, 'USD') })] }),
        [],
        AT,
      ),
    ).toThrow(InvalidOrderError);
  });

  it('accepts an exact payment-sum match', () => {
    const order = createOrder(baseInput(), [], AT);
    expect(order.payments).toHaveLength(1);
    expect(order.payments[0]?.amountInOrderCurrency.minorUnits).toBe(order.total.minorUnits);
  });
});

describe('createOrder — currency conversion rules (3.9)', () => {
  it('cross-currency line/payment with no resolvable rate propagates RateNotFoundError, no partial aggregate', () => {
    expect(() =>
      createOrder(
        baseInput({
          lines: [
            usdLine(),
            {
              productId: 'product-2',
              productName: 'Producto MN sin tasa',
              categoryName: 'Categoria B',
              price: money(35000n, 'MN'),
              quantity: 1,
            },
          ],
        }),
        [],
        AT,
      ),
    ).toThrow(RateNotFoundError);
  });

  it('same-currency with no rate on file uses 1x1 identity (delegates to Phase 1)', () => {
    const order = createOrder(baseInput(), [], AT);
    expect(order.lines[0]?.rateApplied.id).toBeUndefined();
  });
});

describe('confirmOrder / deliverOrder / cancelOrder — pure state-machine guards (3.10)', () => {
  it('confirmOrder transitions created -> verified and stamps verifiedAt', () => {
    const created = createOrder(baseInput(), [], AT);
    const confirmedAt = new Date('2026-07-23T00:00:00Z');
    const confirmed = confirmOrder(created, confirmedAt);
    expect(confirmed.status).toBe('verified');
    expect(confirmed.verifiedAt).toEqual(confirmedAt);
  });

  it('confirmOrder rejects a non-created source (double-verify)', () => {
    const created = createOrder(baseInput(), [], AT);
    const confirmed = confirmOrder(created, AT);
    expect(() => confirmOrder(confirmed, AT)).toThrow(InvalidOrderStateError);
  });

  it('deliverOrder rejects a created order (must be verified first)', () => {
    const created = createOrder(baseInput(), [], AT);
    expect(() => deliverOrder(created, AT)).toThrow(InvalidOrderStateError);
  });

  it('deliverOrder transitions verified -> delivered directly and stamps deliveredAt', () => {
    const created = createOrder(baseInput(), [], AT);
    const confirmed = confirmOrder(created, AT);
    const deliveredAt = new Date('2026-07-24T00:00:00Z');
    const delivered = deliverOrder(confirmed, deliveredAt);
    expect(delivered.status).toBe('delivered');
    expect(delivered.deliveredAt).toEqual(deliveredAt);
  });

  it('cancelOrder succeeds from created', () => {
    const created = createOrder(baseInput(), [], AT);
    expect(cancelOrder(created, AT).status).toBe('cancelled');
  });

  it('cancelOrder succeeds from verified', () => {
    const created = createOrder(baseInput(), [], AT);
    const confirmed = confirmOrder(created, AT);
    expect(cancelOrder(confirmed, AT).status).toBe('cancelled');
  });

  it('delivered is terminal — confirm/deliver/cancel all rejected', () => {
    const created = createOrder(baseInput(), [], AT);
    const confirmed = confirmOrder(created, AT);
    const delivered = deliverOrder(confirmed, AT);
    expect(() => confirmOrder(delivered, AT)).toThrow(InvalidOrderStateError);
    expect(() => deliverOrder(delivered, AT)).toThrow(InvalidOrderStateError);
    expect(() => cancelOrder(delivered, AT)).toThrow(InvalidOrderStateError);
  });

  it('InvalidOrderStateError carries the order id, expected, and actual status', () => {
    const created = createOrder(baseInput(), [], AT);
    const confirmed = confirmOrder(created, AT);
    const delivered = deliverOrder(confirmed, AT);
    try {
      cancelOrder(delivered, AT);
      expect.unreachable('cancelOrder must throw on a terminal delivered order');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidOrderStateError);
      const stateError = err as InstanceType<typeof InvalidOrderStateError>;
      expect(stateError.orderId).toBe(delivered.id);
      expect(stateError.actual).toBe('delivered');
    }
  });
});
