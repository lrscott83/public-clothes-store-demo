import type { Money } from '../currency/money.js';

/**
 * What a single unit of a product earns its selling agent. Denominated in MN
 * and ONLY in MN: the commission table is authored in national currency and
 * never converted, so there is no rate to freeze and no cross-currency
 * arithmetic to get wrong.
 *
 * `productId` — not a name. Name matching happens ONCE, at seed time, into
 * this table; the request path only ever does an id lookup. Fuzzy matching is
 * a data-authoring problem, and doing it per request would make every sale
 * depend on a heuristic nobody can audit after the fact.
 */
export interface ProductCommissionReference {
  readonly productId: string;
  readonly comisionMN: Money;
}
