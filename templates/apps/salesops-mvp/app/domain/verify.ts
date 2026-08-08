import type { OrderItem } from './types';
import { sumOrderCommission } from '../seed/enrich-products';

export interface VerifiedTotals {
  exchangeRateSnapshot: { usdToMn: number };
  totalMN: number;
  commissionMN: number;
}

/**
 * Pure rate-freeze + total computation, byte-identical to the seed's own
 * precedent (`seed/generate.ts:185-187`): `totalMN = Math.round(totalUSD *
 * usdToMn)`, `commissionMN = sumOrderCommission(items)`. Reused by
 * `verifyOrder` so seeded and user-verified orders compute the same way.
 */
export function buildVerifiedTotals(totalUSD: number, usdToMn: number, items: OrderItem[]): VerifiedTotals {
  return {
    exchangeRateSnapshot: { usdToMn },
    totalMN: Math.round(totalUSD * usdToMn),
    commissionMN: sumOrderCommission(items),
  };
}
