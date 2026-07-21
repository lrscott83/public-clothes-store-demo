# Commission seam (Option B) — documented, NOT implemented

`Product` (see `product.ts`) carries **zero** commission-related fields.
This is a deliberate boundary decision (engram `#1312`,
`sdd/backend-products/decision-commission-placement`): commission is an
add-on concern owned by a **future** Gestores/Comisiones module, never
embedded in core master data.

## Why

Product is CAPA BASE (base layer) master data referenced by Ventas,
Inventario and Finanzas. Coupling a commission amount directly onto
`Product` would force every consumer of core product data to carry
commission semantics, even when the Gestores/Comisiones module is absent
or disabled. Option B keeps `Product` independent and lets commission be
resolved through a port, exactly like Currency's `Money`/`ExchangeRate`
never assume a specific settlement channel is always configured.

This retires the MVP's direct coupling
(`SeededProduct.commissionMN` -> `pedidos-nuevo.tsx:80`), which hard-wired
a commission amount onto the product record itself.

## The seam (future, NOT part of this change)

A future Gestores/Comisiones module would own:

```ts
/** Owned by the future Gestores/Comisiones module — NOT this change. */
interface ProductCommissionReference {
  readonly productId: string;
  readonly comisionMN: Money; // MN-denominated commission amount
}

/** Owned by the future Gestores/Comisiones module — NOT this change. */
interface ICommissionReferenceProvider {
  commissionFor(productId: string): Promise<Money | undefined>;
}
```

Ventas (or any other consumer) would inject `ICommissionReferenceProvider`
and call `commissionFor(productId)`. When the Gestores/Comisiones module is
not enabled, the provider resolves to `undefined` (never a silent `0` that
could be mistaken for "no commission configured" vs. "commission is
exactly zero") — the caller decides how to treat an absent value.

## Verification

`Product`'s field list (`product.ts`) has zero `commission`/`comisionMN`
(or equivalent) fields — `rg -i "commission|comisionMN"` under
`packages/domain/src/product/` resolves to ONLY this doc file, confirming
the seam is named/documented but never implemented or exported from the
domain barrel in this change.
