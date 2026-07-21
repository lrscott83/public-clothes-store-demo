# Stock reservation seam — documented, NOT implemented

`Inventario` (this change) owns physical `onHand` and its append-only
`StockMovement` audit log, plus the plain `StockLevel.reserved` field. It
does **not** own reservation/release/decrement semantics — that is the
future **Ventas** module's job (design.md decision, locked model
`sdd/backend-inventory/model` #1340).

## Why

Coupling reservation orchestration (hold stock for a pending order, release
on cancel, decrement at fulfillment) onto Inventario would force every
consumer of core stock data to carry Ventas-specific order-lifecycle
semantics, even when Ventas is absent or disabled. Inventario stays a base
CAPA (like Product/Currency): it exposes `reserved` as a plain field and the
atomic `record` movement primitive; Ventas composes those into reservation
behavior.

## The seam (future, NOT part of this change)

A future Ventas module would own:

```ts
/** Owned by the future Ventas module — NOT this change. */
interface IStockReservationProvider {
  reserve(productId: string, warehouseId: string, qty: number): Promise<void>;
  release(productId: string, warehouseId: string, qty: number): Promise<void>;
  /** At fulfillment: decrements onHand by creating a `sale_out` StockMovement. */
  decrement(productId: string, warehouseId: string, qty: number): Promise<void>;
}
```

`reserve`/`release` adjust `StockLevel.reserved` ONLY — never a
`StockMovement` (reservations do not move physical stock). `decrement` is
the ONLY reservation operation that records a movement (`sale_out`), and it
does so via `IStockMovementRepository.record` — the same atomic
onHand-mutation entrypoint every other physical change uses, never a direct
write.

Availability-for-sale (`Product.active AND availableStock(level) > 0`) is
also Ventas' concern, computed there from `Product.active` (via
`IProductRepository`) and `StockLevel.available` (via `availableStock`) —
Inventario deliberately does not expose a combined flag (design.md: "the
system MUST document but MUST NOT implement" this seam).

## Verification

`rg -i "reserve|release|decrement" templates/packages/domain/src/inventory/`
(excluding this doc file and the plain `reserved` field name) resolves to no
implementation — only the `IStockReservationProvider` contract is
documented here, and it is NOT exported from `inventory/index.ts`.
