# Tasks: Appliances Storefront Vertical

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~600-900 (bulk is ~100 binary image copies + generated catalog.json ~400-600 lines + 2 new source files ~150 lines + 2-line wiring diff) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (extraction dataset, provenance-only, not shipped) → PR 2 (images + catalog.json + store.config.ts) → PR 3 (test + verticals.ts wiring + verify) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending (ask user) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

Note: PR 1's extraction-dataset.json lives under `openspec/changes/...` (provenance, not app bundle) — reviewable as text but large. PR 2 is dominated by binary image renames/copies (low review effort per file, high file count) plus a large generated JSON. PR 3 is small/high-value (test + 2-line wiring) and is the actual behavior-risk surface — keep it isolated so reviewers focus there.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Stage A extraction-dataset.json complete (records + taxonomy + skipped) | PR 1 | No app changes; pure data artifact; base = tracker/main per chosen chain strategy |
| 2 | Images organized + catalog.json + store.config.ts generated | PR 2 | Depends on PR 1; bulk of binary diff |
| 3 | Vertical wiring + config test + build/verify green | PR 3 | Depends on PR 2; smallest, highest-scrutiny diff |

**BLOCKED on user decision (D6):** Task 3.3 (store `brand.name`/tagline) and Task 2.9 (hero image asset) need the user to confirm the appliances store brand name and hero image source before finalizing — currently NOVA-neutral placeholder per design §6/§8-D6.

## Phase 1: Stage A — Vision Extraction (~100 flyers, batched)

- [x] 1.1 Create `extraction-dataset.json` (flat-list variant: each record carries `skipped`/`needs_review` flags rather than separate arrays — functionally equivalent).
- [x] 1.2 Batch 1: records appended per design §1-§2 schema.
- [x] 1.3 Batch 2: same extraction rules.
- [x] 1.4 Batch 3: same extraction rules.
- [x] 1.5 Batch 4: same extraction rules.
- [x] 1.6 Batch 5: same extraction rules.
- [x] 1.7 Batch 6: same extraction rules.
- [x] 1.8 Batch 7: same extraction rules.
- [x] 1.9 Batch 8: same extraction rules.
- [x] 1.10 Batch 9: same extraction rules.
- [x] 1.11 Batch 10: 103 records from 100 source files, all accounted for.
- [x] 1.12 Taxonomy finalized: 28 raw extraction slugs merged into 11 owner-approved categories via `CATEGORY_MAP` in the ETL (TV y Audio, Energía Solar, Cocinas, Refrigeración, Lavadoras, Climatización, Ollas, Útiles, Licuadoras, Cafeteras, Freidoras).
- [x] 1.13 Multi-product-flyer policy applied (103 records > 100 files: split products with attributable per-product price).
- [x] 1.14 Dataset finalized; every `source_filename` accounted for (74 published + 26 needs_review + 4 skipped, minor flag overlap).

## Phase 2: Stage B — Organization + Catalog Generation

- [x] 2.1 Per-category folders created under `public/verticals/appliances/products/<slug>/` (28 slugs).
- [x] 2.2 74 source images COPIED to `<slug><index>.jpeg` (1-based, ascending `source_filename`); `assets/appliances/` untouched.
- [x] 2.3 Global sequential string `id` assigned `(slug asc, index asc)` — 74 unique ids verified.
- [x] 2.4 `catalog.json` `categories[]` generated (28, slug asc).
- [x] 2.5 `catalog.json` `products[]` generated: folded `description` per §5; 5 `originalPrice`/`discount` from printed previous prices.
- [x] 2.6 `needs_review`/unpriced records excluded (74 of 103 published).
- [x] 2.7 `catalog.json` written to `templates/apps/static-store/verticals/appliances/`.
- [x] 2.8 `store.config.ts` created mirroring `clothes` (verticalAsset mapping, en-US/USD, steel-blue theme, nav/features/footer).
- [x] 2.9 **[D6 resolved]** `brand.name` = "NOVA Electrodomésticos" (user-confirmed); `hero.jpg` = free-license Pexels photo (pexels.com/photo/15409513, no attribution required), stored locally.

## Phase 3: Stage C — Vertical Wiring + Verify (TDD: test first)

- [x] 3.1 Wrote `appliances-config.test.ts` mirroring `clothes-config.test.ts` (+ discount/originalPrice invariant).
- [x] 3.2 GREEN — Phase 2 outputs pass; counts asserted (74 products / 28 categories).
- [x] 3.3 **[D6 resolved]** Wired `appliancesConfig` into `app/store/verticals.ts` (import + map entry); brand copy finalized.
- [x] 3.4 `npm test` — 65 tests green (15 files), including 7 new appliances tests.
- [x] 3.5 `npm run build` — clean; `VITE_STORE_VERTICAL=appliances` also prerenders cleanly.
- [x] 3.6 Orphan check — 74 images, 74 referenced, 0 orphans, 0 missing (verified in Stage B).
- [x] 3.7 Smoke — prerendered HTML contains appliance hero heading + product names; 75 assets (74 + hero) copied to build.
