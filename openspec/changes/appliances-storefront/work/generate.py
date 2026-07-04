#!/usr/bin/env python3
"""Stage B ETL: extraction-dataset.json -> organized images + catalog.json.

Offline, reproducible, idempotent. Reads the Stage A dataset, filters to
published records (priced, not skipped, not needs_review), derives the
taxonomy, copies each source flyer into a per-category folder, and emits
catalog.json in StoreProduct shape.

Source images are COPIED, never moved/renamed (decision #616 + user policy:
originals in assets/appliances/ are the source of truth).

Run from repo root:  python3 openspec/changes/appliances-storefront/work/generate.py
"""
import json
import re
import shutil
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DATASET = REPO / "openspec/changes/appliances-storefront/extraction-dataset.json"
SRC_DIR = REPO / "assets/appliances"
APP = REPO / "templates/apps/static-store"
PRODUCTS_DIR = APP / "public/verticals/appliances/products"
CATALOG_OUT = APP / "verticals/appliances/catalog.json"


def title_case(slug: str) -> str:
    """Spanish display name from a kebab slug: 'luces-solares' -> 'Luces Solares'."""
    return " ".join(word.capitalize() for word in slug.split("-"))


def fold_description(rec: dict, category_name: str) -> str:
    """§5 spec folding: join present fields with ' · ' in fixed order.
    Fall back to the category display name when every spec field is null."""
    parts = []
    if rec.get("brand"):
        parts.append(f"Marca: {rec['brand']}")
    if rec.get("capacity"):
        parts.append(str(rec["capacity"]))
    if rec.get("voltage"):
        parts.append(str(rec["voltage"]))
    if rec.get("color"):
        parts.append(f"Color: {rec['color']}")
    if rec.get("condition"):
        parts.append(str(rec["condition"]))
    return " · ".join(parts) if parts else category_name


def original_price(rec: dict):
    """Parse a printed previous price from notes, only when strictly > price.
    Matches 'original price $N' or 'previous price $N' (design §5, conservative)."""
    notes = rec.get("notes") or ""
    m = re.search(r"(?:original|previous)\s+price\s*\$?(\d+)", notes, re.I)
    if not m:
        return None
    orig = int(m.group(1))
    return orig if orig > rec["price_usd"] else None


def main():
    records = json.loads(DATASET.read_text())
    published = [
        r for r in records
        if not r.get("skipped")
        and not r.get("needs_review")
        and r.get("price_usd") not in (None, "", 0)
    ]

    # Taxonomy: distinct categories among published, sorted by slug asc.
    slugs = sorted({r["category"] for r in published})
    categories = [{"id": s, "name": title_case(s)} for s in slugs]

    # Reset target folder so re-runs stay clean (never touches assets/appliances).
    if PRODUCTS_DIR.exists():
        shutil.rmtree(PRODUCTS_DIR)

    products = []
    global_id = 0
    for slug in slugs:
        name = title_case(slug)
        in_cat = sorted(
            (r for r in published if r["category"] == slug),
            key=lambda r: r["source_filename"],
        )
        cat_dir = PRODUCTS_DIR / slug
        cat_dir.mkdir(parents=True, exist_ok=True)
        for index, rec in enumerate(in_cat, start=1):
            filename = f"{slug}{index}.jpeg"
            src = SRC_DIR / rec["source_filename"]
            if not src.exists():
                raise FileNotFoundError(f"Missing source flyer: {src}")
            shutil.copy2(src, cat_dir / filename)

            global_id += 1
            product = {
                "id": str(global_id),
                "name": rec["name"],
                "description": fold_description(rec, name),
                "price": rec["price_usd"],
                "categoryId": slug,
                "image": f"products/{slug}/{filename}",
            }
            orig = original_price(rec)
            if orig is not None:
                product["originalPrice"] = orig
                product["discount"] = round(100 * (orig - rec["price_usd"]) / orig)
            products.append(product)

    catalog = {"categories": categories, "products": products}
    CATALOG_OUT.parent.mkdir(parents=True, exist_ok=True)
    CATALOG_OUT.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n")

    print(f"categories: {len(categories)}")
    print(f"products:   {len(products)}")
    print(f"discounts:  {sum(1 for p in products if 'discount' in p)}")
    print(f"catalog:    {CATALOG_OUT.relative_to(REPO)}")
    print(f"images:     {PRODUCTS_DIR.relative_to(REPO)}")


if __name__ == "__main__":
    main()
