/**
 * Request body for `POST /stock/movements`. `type` MUST be one of the 6
 * closed `StockMovementType` values (validated by the controller). `quantity`
 * is a decimal-look string, always a POSITIVE magnitude — direction comes
 * from `type`, never a sign. `reason` is optional free text.
 */
export class RecordMovementDto {
  productId!: string;
  warehouseId!: string;
  type!: string;
  quantity!: string;
  reason?: string;
}
