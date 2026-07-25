/**
 * Wire shape for a `Money`-backed field — `amount` is a decimal string
 * (never a JSON number, decimal fidelity preserved end-to-end) and
 * `currency` is REQUIRED (`"USD"|"EUR"|"MN"`). Mirrors `ProductController`'s
 * `MoneyAmountDto`; kept as its own copy here since every module in this
 * app is self-contained (no cross-module DTO imports).
 */
export interface MoneyAmountDto {
  amount: string;
  currency: string;
}
