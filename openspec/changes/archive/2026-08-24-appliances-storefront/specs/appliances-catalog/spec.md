# Appliances Catalog Specification

## Purpose

Turn the ~100 raw NOVA-reseller appliance flyer images in `assets/appliances/`
into a live `appliances` storefront vertical: extracted product data, organized
images, a generated catalog, and the vertical wired into the existing theme
engine with zero engine changes.

## Requirements

### Requirement: Flyer Field Extraction
The system MUST read every flyer image under `assets/appliances/` and extract
only the fields printed on that image: name/title, brand, price (USD),
capacity/size, voltage, color, and condition. Fields not printed on a given
flyer MUST be recorded as `null`, never inferred or invented.

#### Scenario: Flyer with all fields printed
- GIVEN a flyer that prints name, brand, price, capacity, voltage, color, and condition
- WHEN the flyer is read
- THEN the intermediate dataset entry has all seven fields populated with the printed values

#### Scenario: Flyer missing some fields
- GIVEN a flyer that only prints name and price (no brand, voltage, color, or condition)
- WHEN the flyer is read
- THEN the intermediate dataset entry has `name` and `price` populated
- AND `brand`, `voltage`, `color`, and `condition` are `null`

### Requirement: Reseller Name Exclusion
The system MUST NOT store "NOVA" (or its "Tienda en línea" marketing text) as
the `brand` value for any product.

#### Scenario: Flyer only shows reseller branding, no manufacturer brand
- GIVEN a flyer printing "NOVA — Tienda en línea" but no manufacturer/brand name
- WHEN the flyer is read
- THEN the `brand` field for that product is `null`, not "NOVA"

### Requirement: Unreadable Flyer Handling
The system MUST skip any flyer whose printed text cannot be reliably read and
MUST log the skipped filename with a reason.

#### Scenario: Illegible flyer
- GIVEN a flyer image that is blurry, cropped, or has no legible printed text
- WHEN the flyer is processed
- THEN no product entry is created for that image
- AND the filename and skip reason are recorded in the extraction log

### Requirement: Multi-Product Flyer Handling
WHEN a single flyer image depicts two or more distinct products, the system
MUST either split it into one dataset entry per distinct product OR flag it
for manual review — it MUST NOT silently merge distinct products into one entry.

#### Scenario: Flyer shows two distinct appliances
- GIVEN a flyer that prints two different appliances with separate prices
- WHEN the flyer is processed
- THEN the dataset contains either two separate product entries (one per appliance) or one flagged entry marked for manual review
- AND the entry/entries reference the same source image

### Requirement: Deterministic Image Organization
The system MUST copy each processed flyer into
`public/verticals/appliances/products/<categoria-es>/<slug><index>.jpeg`, where
`<categoria-es>` is the product's Spanish kebab-case category slug and
`<index>` is a sequential integer starting at 1 within that category folder.
Source files under `assets/appliances/` MUST remain unmodified.

#### Scenario: First product in a category
- GIVEN the first extracted product assigned to category `neveras`
- WHEN images are organized
- THEN the image is copied to `public/verticals/appliances/products/neveras/neveras1.jpeg`
- AND the original file in `assets/appliances/` is untouched

#### Scenario: Nth product in a category
- GIVEN four products already organized under `ventiladores`
- WHEN a fifth `ventiladores` product image is organized
- THEN it is copied to `public/verticals/appliances/products/ventiladores/ventiladores5.jpeg`

### Requirement: Spanish Category Slugs
Category identifiers MUST be Spanish kebab-case, consistent with the `clothes`
vertical convention (e.g. `botas-hombres`, `camisas`).

#### Scenario: Category slug format
- GIVEN a finalized category named "Ventiladores"
- WHEN its slug is generated
- THEN the slug is `ventiladores` (lowercase, hyphen-separated, no accents/spaces)

### Requirement: Product-Image Referential Integrity
Every product entry in the generated catalog MUST reference an image file that
exists on disk under `public/verticals/appliances/products/`.

#### Scenario: Catalog product has a matching image file
- GIVEN a product entry with `image: "products/neveras/neveras1.jpeg"`
- WHEN the catalog is validated
- THEN `public/verticals/appliances/products/neveras/neveras1.jpeg` exists

### Requirement: Intermediate Dataset Before Catalog
The system MUST produce a structured intermediate JSON dataset (one entry per
extracted product, plus finalized category taxonomy) BEFORE generating
`catalog.json` or `store.config.ts`. The catalog MUST be derived from this
intermediate dataset, not authored independently.

#### Scenario: Catalog generation depends on intermediate dataset
- GIVEN the intermediate JSON dataset has been finalized for all readable flyers
- WHEN `catalog.json` is generated
- THEN every product in `catalog.json` traces back to exactly one intermediate dataset entry

### Requirement: Catalog Content Fidelity
`catalog.json` and `verticals/appliances/store.config.ts` MUST use `en-US`
locale and `USD` currency, MUST fold brand/capacity/voltage/color/condition
into the product `description` as formatted text, and MUST NOT include any
field value not present in the intermediate dataset.

#### Scenario: Specs folded into description
- GIVEN an intermediate entry with brand "Milexus", capacity "5.5P", voltage "110V"
- WHEN the catalog product is generated
- THEN the product's `description` contains a formatted rendition of those specs (e.g. "Marca: Milexus · 5.5P · 110V")

#### Scenario: No invented data
- GIVEN an intermediate entry with `voltage: null`
- WHEN the catalog product is generated
- THEN the description omits a voltage segment rather than fabricating one

### Requirement: Unique Product IDs
Every product in the generated catalog MUST have a unique `id`. The generator
MUST NOT reproduce the duplicate-`id` defect previously present in the legacy
`products.ts` reference data.

#### Scenario: All generated ids are unique
- GIVEN the full generated `catalog.json` product array
- WHEN ids are checked
- THEN no two products share the same `id`

### Requirement: Vertical Registration
The system MUST register the `appliances` vertical in
`app/store/verticals.ts` with exactly one new import and one new map entry,
mirroring the existing `clothes` registration pattern.

#### Scenario: Vertical resolves and renders
- GIVEN `appliances` is registered in `verticals.ts` pointing at `appliancesConfig`
- WHEN the storefront resolves the `appliances` vertical
- THEN the landing page and product listing render using `appliancesConfig`'s theme, nav, and catalog with no changes to the theme engine or shared components

## Notes for Design

- Multi-product flyer resolution (split vs. flag) is a REQUIRED choice, not
  optional — the design phase MUST pick one default strategy and document it.
- The exact `description` formatting template for folded specs is left to
  design; this spec only requires that folding is lossless relative to the
  intermediate dataset and omits absent fields.
