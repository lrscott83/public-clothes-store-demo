/** Wire shape for a `Money`-backed field (`price`/`finalPrice`) — `amount` is a decimal string, never a JSON number (design.md §3, same discipline as `apps/api-salesops`'s `MoneyAmountDto`). */
export interface PublicMoneyDto {
  readonly amount: string;
  readonly currency: string;
}
