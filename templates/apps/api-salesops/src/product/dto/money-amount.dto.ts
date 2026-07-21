/**
 * Wire shape for a `Money`-backed field (`price`/`cost`/derived `finalPrice`)
 * — `amount` is a decimal string (never a JSON number, decimal fidelity
 * preserved end-to-end) and `currency` is REQUIRED (`"USD"|"EUR"|"MN"`).
 * `price` and `cost` are independent `MoneyAmountDto` values whose
 * currencies MAY DIFFER.
 */
export interface MoneyAmountDto {
  amount: string;
  currency: string;
}
