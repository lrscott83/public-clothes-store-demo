import { randomUUID } from 'node:crypto';
import { money, type Money } from '../currency/money.js';
import type {
  CommissionAccrual,
  CommissionAccrualLine,
  UnresolvedCommissionLine,
} from './commission-accrual.js';

/** One order line, reduced to only what commission depends on: what, and how many. */
export interface ComputeAccrualLineInput {
  readonly orderLineId: string;
  readonly productId: string;
  readonly quantity: number;
}

export interface ComputeAccrualInput {
  readonly orderId: string;
  readonly attributedCompanyUserId: string;
  readonly lines: readonly ComputeAccrualLineInput[];
}

/** Commission is authored in MN and never converted — there is no other currency in this module. */
const COMMISSION_CURRENCY = 'MN' as const;

/**
 * PURE. Turns an order's lines plus a reference snapshot into the accrual.
 *
 * `references` is passed IN rather than looked up, mirroring
 * `createOrder(input, rates, at)`: the application service loads the snapshot,
 * the factory only decides. That is what makes this testable without a
 * database and what makes the result reproducible from its inputs alone.
 *
 * A product ABSENT from `references` is unresolved, not free. It is kept out
 * of `total` and listed in `unresolved` — see `UnresolvedCommissionLine` for
 * why those must stay distinct.
 *
 * Amounts are frozen here by value: mutating `references` afterwards cannot
 * reach into an accrual that was already computed.
 */
export function computeAccrual(
  input: ComputeAccrualInput,
  references: ReadonlyMap<string, Money>,
  at: Date,
): CommissionAccrual {
  const lines: CommissionAccrualLine[] = [];
  const unresolved: UnresolvedCommissionLine[] = [];

  for (const line of input.lines) {
    const unitCommission = references.get(line.productId);
    if (unitCommission === undefined) {
      unresolved.push({
        orderLineId: line.orderLineId,
        productId: line.productId,
        quantity: line.quantity,
      });
      continue;
    }

    lines.push({
      id: randomUUID(),
      orderLineId: line.orderLineId,
      productId: line.productId,
      quantity: line.quantity,
      unitCommission,
      lineCommission: money(
        unitCommission.minorUnits * BigInt(line.quantity),
        unitCommission.currency,
      ),
    });
  }

  const total = lines.reduce(
    (sum, line) => money(sum.minorUnits + line.lineCommission.minorUnits, COMMISSION_CURRENCY),
    money(0n, COMMISSION_CURRENCY),
  );

  return {
    id: randomUUID(),
    orderId: input.orderId,
    attributedCompanyUserId: input.attributedCompanyUserId,
    total,
    lines,
    unresolved,
    accruedAt: at,
    createdAt: at,
    updatedAt: at,
  };
}
