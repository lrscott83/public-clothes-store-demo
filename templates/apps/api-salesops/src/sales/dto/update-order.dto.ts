/**
 * Request body for `PATCH /orders/:id`. Only allowed while the order is
 * still `created` — once `verified` the aggregate is frozen (rate+totals
 * immutable, design.md decision #2) and `OrderService.update` rejects with
 * `InvalidOrderStateError` (-> 409). Lines/payments are NOT editable via
 * this endpoint, only the flat header fields — editing the aggregate's
 * priced contents would require re-running the whole `createOrder` factory,
 * out of scope this slice.
 *
 * `customerName` is NOT patchable: it is a snapshot of the `Customer` record,
 * resolved at creation. Accepting it here would reopen exactly the hole that
 * removing it from `POST /orders` closed — a caller renaming the buyer on a
 * persisted order. To point an order at a different customer, cancel it and
 * create another; the order is a transactional event, not a mutable form.
 */
export class UpdateOrderDto {
  warehouseId?: string;
  deliveryMode?: string;
}
