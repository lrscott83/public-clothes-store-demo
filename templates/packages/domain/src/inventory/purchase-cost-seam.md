# Purchase-cost seam — documented, NOT implemented

`Product.cost` is currently seeded as a SYNTHETIC placeholder
(`price * 0.6`, see `infra-db/src/product/seed.ts`) — there is no real
supplier-cost source yet. Recomputing `Product.cost` from real purchase
receipts is the future **Compras** module's job, not Inventario's
(design.md decision, locked model `sdd/backend-inventory/model` #1340).

## Why

Inventario owns the physical stock ledger (`StockMovement`) but not
purchasing/procurement workflow (receipt headers, supplier lines, landed
cost). A `purchase_in` movement records THAT stock arrived; it does not by
itself justify recomputing `Product.cost` — that requires purchase-line
`unitCost` data Inventario never receives. Keeping the recompute in Compras
avoids forcing Inventario to understand weighted-average costing or carry
purchasing-specific fields.

## The seam (future, NOT part of this change)

A future Compras module owns purchase receipts (header + lines). Per
received line it would:

```ts
/** Owned by the future Compras module — NOT this change. */
interface IPurchaseCostUpdater {
  applyReceipt(line: {
    productId: string;
    warehouseId: string;
    quantity: number;
    unitCost: Money;
  }): Promise<void>;
}
```

`applyReceipt` does two things:

1. Creates a `purchase_in` `StockMovement` via
   `IStockMovementRepository.record` — the same atomic onHand-mutation
   entrypoint every other physical change uses, never a direct write.
2. Recomputes the real `Product.cost` by weighted average — the real source
   that replaces today's synthetic `price * 0.6` placeholder.

Inventario exposes the movement seam Compras needs (`record` with type
`purchase_in`); the cost recompute itself is entirely Compras' concern and
is never built here.

## Verification

`rg -i "weighted.?average|unitCost|purchase.?cost" templates/packages/domain/src/inventory/`
(excluding this doc file) resolves to no implementation — only the
`IPurchaseCostUpdater` contract is documented here, and it is NOT exported
from `inventory/index.ts`.
