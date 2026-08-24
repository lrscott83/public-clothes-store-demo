# Archive Report — appliances-storefront

## Verdict

ARCHIVED — intentional partial archive, owner-approved. The implementation
was 100% complete and shipped to production (GitHub Pages `/appliances/`)
weeks before this archive; the owner subsequently declared
`apps/static-store` legacy/frozen (see the STATUS banner in
`openspec/specs/salesops-storefront/spec.md`), closing this change's future.

## What shipped

The **NOVA Electrodomésticos** vertical for the themeable static storefront,
proving a "vertical is DATA, not code" end-to-end on real content:

- Stage A: vision extraction of ~100 WhatsApp flyer photos →
  `extraction-dataset.json` (103 records; 74 published + 26 needs_review all
  rescued by the owner + 4 non-appliance skipped → **99 products published**;
  every `source_filename` accounted for).
- Taxonomy: 28 raw slugs merged into 11 owner-approved categories.
- Stage B: per-category image folders under
  `public/verticals/appliances/products/<slug>/`, global sequential ids,
  generated `catalog.json` (with `originalPrice`/`discount` from printed
  previous prices where present), `store.config.ts` (en-US/USD, steel-blue
  theme), brand name "NOVA Electrodomésticos" (owner-confirmed) and free-
  license Pexels hero.
- Stage C: `appliances-config.test.ts`, one-line `verticals.ts` wiring,
  build/prerender/smoke verification (74 images referenced, 0 orphans).

Deployed via the multi-target pages build (`scripts/build-pages-site.mjs`
target `appliances`) and live at `/appliances/`.

## Verification record

- **No `verify-report.md` exists** — intentional partial archive approved by
  the owner. Compensating evidence:
  - tasks.md records green runs at implementation time (65 tests / 15 files,
    clean build, prerender smoke, orphan check).
  - **Fresh re-run today at archive time**: `pnpm --filter
    @store-mgmt/static-store test` → **18 files / 96 tests passed**
    (includes this change's appliances-config suite).
- The frozen `salesops-storefront` spec was intentionally NOT touched by
  this archive (the vertical is additive data; the engine remained frozen).

## Provenance data

`extraction-dataset.json` and the `work/` batch artifacts are provenance for
the vision-extraction pipeline and ship inside the archive as-is.

## Cycle metadata

- Commits lineage: implemented across June–July 2026 store_nova_appliance /
  main history; archived from a fully-checked tasks artifact (16/16-style
  complete — no unchecked boxes).
- Archived alongside the same-day closure of `delivery-hardening` and
  `platform-superadmin`, leaving `openspec/changes/` empty of active work.
