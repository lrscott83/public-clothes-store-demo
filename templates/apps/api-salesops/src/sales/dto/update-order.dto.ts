/**
 * Request body for `PATCH /orders/:id`. Only allowed while the order is
 * still `created` — once `verified` the aggregate is frozen (rate+totals
 * immutable, design.md decision #2) and `OrderService.update` rejects with
 * `InvalidOrderStateError` (-> 409). Lines/payments are NOT editable via
 * this endpoint, only the flat header fields — editing the aggregate's
 * priced contents would require re-running the whole `createOrder` factory,
 * out of scope this slice.
 */
export class UpdateOrderDto {
  customerName?: string;
  warehouseId?: string;
  deliveryMode?: string;
}
