import { describe, it, expect } from 'vitest';
import { money, moneyToDecimalString } from '../currency/money.js';
import { computeAccrual } from './compute-accrual.js';

const ORDER_ID = 'order-1';
const AGENT = 'company-user-agent';
const AT = new Date('2026-07-30T12:00:00.000Z');

/** `mn('300.00')` — the commission table is denominated in MN and only in MN. */
function mn(value: string) {
  const [int, frac = '00'] = value.split('.');
  return money(BigInt(int + frac.padEnd(2, '0')), 'MN');
}

describe('computeAccrual', () => {
  it('sums unit commission x quantity across resolved lines', () => {
    const accrual = computeAccrual(
      {
        orderId: ORDER_ID,
        attributedCompanyUserId: AGENT,
        lines: [
          { orderLineId: 'line-1', productId: 'p-300', quantity: 2 },
          { orderLineId: 'line-2', productId: 'p-200', quantity: 1 },
        ],
      },
      new Map([
        ['p-300', mn('300.00')],
        ['p-200', mn('200.00')],
      ]),
      AT,
    );

    expect(moneyToDecimalString(accrual.total)).toBe('800.00');
    expect(accrual.total.currency).toBe('MN');
    expect(accrual.lines).toHaveLength(2);
    expect(accrual.unresolved).toHaveLength(0);
    expect(moneyToDecimalString(accrual.lines[0]!.lineCommission)).toBe('600.00');
    expect(moneyToDecimalString(accrual.lines[1]!.lineCommission)).toBe('200.00');
  });

  /**
   * The load-bearing case. A product with no configured commission is NOT worth
   * zero — it is worth *unknown*. Zeroing it would silently under-pay an agent
   * and leave nothing in the record to notice: the accrual would look complete.
   * So the line is excluded from the total AND carried in `unresolved`, where a
   * report can surface it as missing configuration rather than as earnings.
   */
  it('excludes an unresolvable line from the total and flags it, never zeroing it', () => {
    const accrual = computeAccrual(
      {
        orderId: ORDER_ID,
        attributedCompanyUserId: AGENT,
        lines: [
          { orderLineId: 'line-1', productId: 'p-300', quantity: 2 },
          { orderLineId: 'line-2', productId: 'p-unconfigured', quantity: 5 },
        ],
      },
      new Map([['p-300', mn('300.00')]]),
      AT,
    );

    expect(moneyToDecimalString(accrual.total)).toBe('600.00');
    expect(accrual.lines).toHaveLength(1);
    expect(accrual.lines[0]!.orderLineId).toBe('line-1');
    expect(accrual.unresolved).toEqual([
      { orderLineId: 'line-2', productId: 'p-unconfigured', quantity: 5 },
    ]);
    // The unresolved line must appear NOWHERE among the resolved ones, at any
    // amount — including zero.
    expect(accrual.lines.some((l) => l.productId === 'p-unconfigured')).toBe(false);
  });

  it('freezes the unit commission onto each line, so a later table edit cannot restate it', () => {
    const references = new Map([['p-300', mn('300.00')]]);
    const accrual = computeAccrual(
      {
        orderId: ORDER_ID,
        attributedCompanyUserId: AGENT,
        lines: [{ orderLineId: 'line-1', productId: 'p-300', quantity: 2 }],
      },
      references,
      AT,
    );

    references.set('p-300', mn('999.00'));

    expect(moneyToDecimalString(accrual.lines[0]!.unitCommission)).toBe('300.00');
    expect(moneyToDecimalString(accrual.total)).toBe('600.00');
  });

  it('yields a zero total when NO line resolves, with every line flagged', () => {
    const accrual = computeAccrual(
      {
        orderId: ORDER_ID,
        attributedCompanyUserId: AGENT,
        lines: [
          { orderLineId: 'line-1', productId: 'p-a', quantity: 1 },
          { orderLineId: 'line-2', productId: 'p-b', quantity: 3 },
        ],
      },
      new Map(),
      AT,
    );

    // Zero because nothing is owed *yet*, and `unresolved` is what says so —
    // a zero total with an EMPTY unresolved list would be the dangerous shape.
    expect(moneyToDecimalString(accrual.total)).toBe('0.00');
    expect(accrual.lines).toHaveLength(0);
    expect(accrual.unresolved).toHaveLength(2);
  });

  it('carries the order, the agent and the accrual timestamp through', () => {
    const accrual = computeAccrual(
      {
        orderId: ORDER_ID,
        attributedCompanyUserId: AGENT,
        lines: [{ orderLineId: 'line-1', productId: 'p-300', quantity: 1 }],
      },
      new Map([['p-300', mn('300.00')]]),
      AT,
    );

    expect(accrual.orderId).toBe(ORDER_ID);
    expect(accrual.attributedCompanyUserId).toBe(AGENT);
    expect(accrual.accruedAt).toEqual(AT);
    expect(accrual.id).toEqual(expect.any(String));
  });
});
