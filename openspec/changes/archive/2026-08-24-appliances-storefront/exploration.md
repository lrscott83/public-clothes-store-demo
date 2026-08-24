# Exploration: appliances-storefront

> Backfilled from Engram `sdd/appliances-storefront/explore` (id 619). The explore
> phase had no Write tool; this file is the on-disk parity copy.

## Current State

Sampled 10 of ~100 images in `assets/appliances/` (WhatsApp-named `.jpeg`):
3 chest freezers ("nevera", brands Milexus/Royal, sizes 3.5P/6-pies/5.5P),
1 industrial fan (Royal, 30"), 1 solar rechargeable street lamp (200W),
1 washing machine (Samsung, 9kg, "liquidación/reparada/sin garantía"),
1 TV HD decoder box (Vivamax), 2 solar inverters (Sumry 3.6kW, Must 3kW),
1 small solar light kit (100W, $45).

**Data-policy correction:** these are marketing FLYER images from a reseller
("NOVA", "Somos NOVA Tienda en línea") with text overlays. Most flyers explicitly
print PRICE (USD), BRAND, CAPACITY/SIZE, COLOR, VOLTAGE, and sometimes
warranty/condition ("Garantía 30 días", "Reparada / Sin garantía") plus delivery
notes tied to towns (Consolación del Sur, Herradura, Pinar del Río). This is a
Cuban/Pinar del Río informal-market catalog. "Extract only what's visible" still
applies, but what's visible is MUCH richer than assumed — price, brand, capacity,
color, voltage are legible on most flyers and MUST be extracted per-image, not
defaulted to null. Flyer layout/branding (delivery zones, warranty copy, the
reseller name "NOVA") is NOT product data and must be excluded.

**"(1)"-suffix hypothesis: REFUTED.** Checked 3 same-timestamp pairs — every pair
is a DIFFERENT, unrelated product. The "(1)" suffix is WhatsApp's filename-collision
marker for two images saved in the same second, NOT a second photo of the same
product. Treat each filename (with or without "(1)") as a DISTINCT product candidate.

Observed taxonomy (10 samples): neveras/congeladores, ventiladores,
lámparas/luces solares, lavadoras, decodificadores TV, inversores solares
(+ implied paneles solares). Full taxonomy TBD after reading all ~100.

## Affected Areas

- `templates/apps/static-store/app/store/verticals.ts` — registry; +1 import, +1 map entry.
- `templates/apps/static-store/verticals/{clothes,demo}/` — pattern to clone (`store.config.ts` + `catalog.json`).
- `templates/apps/static-store/public/verticals/{clothes}/products/<category>/` — image target location.
- `templates/packages/storefront/src/catalog/types.ts` — `StoreProduct` has NO brand/capacity/color/voltage fields.
- `assets/appliances/*.jpeg` — source images, WhatsApp-named, need vision-read + rename + move.

## Recommendation

**Option B — templates turborepo, new `appliances` vertical.** The vertical system
exists precisely to onboard a new store via re-skin (brand/theme/catalog) with zero
engine changes. Fold brand/capacity/voltage/color into a structured `description`
string (mirroring how `clothes` uses `description`) to keep the change additive; keep
these OUT of the type system for v1. Run a FULL vision pass over all ~100 images
before renaming to finalize taxonomy and product count.

## Ready for Proposal

Yes — proceed with Option B, description-only attribute encoding.
