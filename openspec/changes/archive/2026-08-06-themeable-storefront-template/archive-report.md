# Archive Report — themeable-storefront-template

**Date Archived**: 2026-08-06
**Change Status**: CLOSED
**Verdict**: PASS WITH WARNINGS — the CRITICAL was resolved on 2026-07-02, before archiving

## Executive Summary

`themeable-storefront-template` turned the single-purpose clothes storefront into a
verticals-as-data engine: the `@store-mgmt/storefront` package (theme / catalog /
config seams) plus `apps/static-store` consuming it, deployable to GitHub Pages under
a subpath. 74/74 tasks complete.

Its `sdd-verify` (Engram `#520`, 2026-07-02) returned **PASS WITH WARNINGS**: 177/177
tests green, typecheck and build clean, and the riskiest piece — the Pages subpath
deploy (base/basename threading, prerender HTML flattening, `404.html` fallback) —
independently re-verified by inspecting real build output rather than trusting the
apply narrative. The CSS-var cascade override was likewise verified against the
compiled CSS.

## CRITICAL — resolved 2026-07-02, before archiving

**Finding**: spec §6 required `currency = product.currency ?? StoreConfig.currency`
with an explicit precedence scenario. `StoreProduct` had no `currency` field, and both
`ProductCard` and `product-detail` always formatted with `config.currency`. Root cause:
`design.md` dropped the field before apply began, so apply faithfully implemented an
already-diverged design.

**Resolution**: the owner amended the spec rather than the code — commit `ecfb6ff`,
two minutes after the verify run:

> Record the accepted exception: currency is store-level only (StoreConfig.currency),
> no per-product override (YAGNI). Reconcile StoreProduct shape with the
> implementation (image required, images optional). Resolves the verify CRITICAL as a
> spec drift, not a defect.

That commit removed the precedence scenario from §6, added the accepted-exception note
to §2, and reconciled `images` (non-empty array) → `images?` (optional gallery). The
code and the spec have agreed since. **The CRITICAL was closed a month before this
archive, not by this archive.**

## WARNINGs — carried forward, not blocking

1. `StoreProduct.images` is an unused optional field (0/62 clothes products set it); the real field is `image`, singular. Reconciled in `ecfb6ff`.
2. `hero.ctaLabel`/`ctaHref` are spec MUST fields but optional in `HeroConfig` and unenforced by `validateStoreConfig`. Pre-existing `design.md` decision.
3. Nav/footer anchor targets require the config author to embed the leading `#` in `path`, rather than the component auto-prepending it.
4. Per-task TDD RED/GREEN evidence for Slices 1–5 is not independently retrievable from the merged apply-progress observation. Traceability gap, not a functional defect — all 177 tests pass.

## SUGGESTIONs — carried forward

1. `CatalogProvider.getProductById(id)` vs the spec's literal `getProduct(id)`.
2. `@store-mgmt/domain` is declared as a `static-store` dependency but never imported — safe to prune.

## Artifacts Archived

Moved from `openspec/changes/themeable-storefront-template/` to
`openspec/changes/archive/2026-08-06-themeable-storefront-template/`:

- `proposal.md`, `design.md`, `tasks.md` (74/74), `spec.md`

## Specs Merged

`spec.md` → `openspec/specs/salesops-storefront/spec.md` (NEW capability).

Requirements were carried over unchanged — the change is closed and its behavior is
what it is. Only the header was rewritten, to record two things a future reader needs
before touching anything:

1. **The capability is FROZEN.** The owner declared `static-store` / `packages/storefront` legacy and off-limits on 2026-08-06. The spec is a record, not a work contract.
2. **`StoreProduct` is not the product contract for backend work.** That is the tenant `Product` model plus `ProductResponseDto`. `backend-products` decided explicitly that "the storefront `StoreProduct` type stays where it is (not merged into the domain entity)", and treats `images`/`isNew`/`discount`/`originalPrice` as presentation-only fields no backend logic reads.

Both notes exist because this exact confusion already cost a round of work: a
per-product `currency` field was added to `packages/storefront`'s `StoreProduct` and to
`static-store` before it was established that the front is frozen and that the
designed model already carries `priceCurrency` as a REQUIRED field. That work was
reset (`git reset --hard 12ea0b2`); the Engram entries describing it are marked
RETRACTED.

## Related

- `archive/2026-07-21-backend-products/` — decided that `StoreProduct` and the domain `Product` stay separate
- `openspec/specs/salesops-products/spec.md` — the live product capability
- `docs/plans/estrategia-backend-por-modulos.md` — the module-by-module plan this front sits outside of
