/**
 * Response shape for `GET /stock`. `onHand`/`reserved`/`available` are
 * decimal-look strings (never a JSON number, mirrors `MoneyAmountDto`
 * string discipline) even though the underlying values are whole-unit
 * integers. `available` is DERIVED at read time via `availableStock` —
 * never a stored column. A missing `StockLevel` row resolves to all-zero
 * (`onHand=0, reserved=0, available=0`), not an error.
 */
export class StockLevelResponseDto {
  productId!: string;
  warehouseId!: string;
  onHand!: string;
  reserved!: string;
  available!: string;
}
