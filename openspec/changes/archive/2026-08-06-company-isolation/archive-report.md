# Archive Report — company-isolation

**Date Archived**: 2026-08-06
**Change Status**: CLOSED — SUPERSEDED
**Verdict**: N/A — no implementation was ever started, so there was nothing to verify.

## Executive Summary

`company-isolation` never advanced past exploration. It was superseded on 2026-08-02,
before any code was written, when the owner answered its Open Question 4 with "several
companies are coming". That answer invalidated the premise every option in the document
rested on: row-level `companyId` scoping (options a and b) is precisely the work the
exploration itself flagged as potentially throwaway against the sibling project's
schema-per-tenant shape.

The work was taken up instead by `multi-tenant-by-schema`
(archived at `archive/2026-08-06-multi-tenant-by-schema/`), which resumed "Approach 1"
from `archive/2026-07-28-company-user-roles-reframe/`.

## Artifacts Archived

Moved from `openspec/changes/company-isolation/` to
`openspec/changes/archive/2026-08-06-company-isolation/`:

- `explore.md` — exploration, carrying its own SUPERSEDED banner

No proposal, spec, design, tasks, apply-progress, or verify-report were ever produced.

## Specs

No delta specs. Nothing to merge into `openspec/specs/`.

The tenancy requirements that this exploration would eventually have produced live in
`openspec/specs/salesops-tenancy/spec.md`, added by `multi-tenant-by-schema`.

## What Remains Useful

Sections 1 and 2 of `explore.md` are still accurate and independent of which tenancy
shape won:

- the entity table (what is company-owned in principle vs company-linked as of 2026-08-02)
- the JOIN-path asymmetry in the pre-split schema

Sections 3–5 (options, backfill plan, open questions) are void. Three of its open
questions dissolved entirely under schema-per-tenant: whether the catalog is global or
company-private, what a supervisor sees for null-attribution orders, and whether the
single-company guard fails hard or allows an opt-in. Each was an artifact of row-level
scoping, not a real product question.

## Origin

Surfaced by the adversarial verify of `sales-agents-commissions`
(`archive/2026-08-02-sales-agents-commissions/verify-report.md`, "Known, owner-deferred
items #1").
