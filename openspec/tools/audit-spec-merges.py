#!/usr/bin/env python3
"""Audit that every delta spec under openspec/changes/** actually reached openspec/specs/.

Why this exists
---------------
On 2026-08-06 an audit found that `openspec/specs/salesops-identity/spec.md` held
`multi-tenant-by-schema`'s amendment delta copied VERBATIM: the amendment had REPLACED the
base spec instead of being merged into it, silently dropping five requirements from the live
contract. `salesops-customers` had likewise never received the five agent-assisted
requirements from `sales-agents-commissions`. Nothing in the SDD flow catches this — an
archive report saying "specs merged" is a claim, not evidence.

Run it after every `sdd-archive`:

    python3 openspec/tools/audit-spec-merges.py

Exit code 0 = clean (only known, documented exceptions remain). Exit code 1 = a delta
requirement is missing from the live contract, or a REMOVED one is still present.
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CHANGES = os.path.join(ROOT, "changes")
SPECS = os.path.join(ROOT, "specs")

SECTION_RE = re.compile(r"^##\s+(ADDED|MODIFIED|REMOVED|RENAMED)\b", re.I)
REQ_RE = re.compile(r"^###\s+Requirement:\s*(.+?)\s*$")

# Delta requirements that are legitimately absent from the live contract.
# Every entry must carry a reason — an unexplained exception is just a hidden bug.
KNOWN_EXCEPTIONS = {
    ("2026-07-18-backend-base-scaffold", "salesops-backend",
     "`infra-db` Package Exposes PrismaService and InfraDbModule"):
        "RENAMED in the merged spec to '`infra-db` Package Exposes the Database Access "
        "Providers'. Same requirement, present.",
    ("2026-07-22-backend-ventas", "salesops-ventas",
     "Order Status Lifecycle with Freeze at Verificado"):
        "RENAMED by ventas-english-rename to '... Freeze at Verified'. Present.",
    ("2026-08-06-backend-users-roles", "salesops-identity",
     "OperadorAlmacen Warehouse Scope"):
        "RENAMED in the merged spec to 'WarehouseOperator Warehouse Scope' per the "
        "code/DB-English convention. Present.",
    ("2026-07-28-company-user-roles-reframe", "salesops-companies",
     "CompanyUser Soft-FK Shape"):
        "SUPERSEDED by multi-tenant-by-schema's 'CompanyUser Collapsed-PK Shape "
        "(Tenant-Side)'.",
    ("2026-07-28-company-user-roles-reframe", "salesops-companies",
     "Single-Company Auto-Assignment on Signup"):
        "DELIBERATELY KILLED by multi-tenant-by-schema — the merged salesops-companies spec "
        "states 'no auto-assignment: explicit Membership required for access'.",
    ("2026-07-28-company-user-roles-reframe", "salesops-companies",
     "CompanyUser Status Gates Access"):
        "SUPERSEDED by 'Master Membership Gates Company Access' + 'Membership Status Gates "
        "Company Access'.",
    ("2026-08-06-backend-users-roles", "salesops-customers",
     "Pre-Existing Customers Are Backfilled with a User"):
        "One-time migration invariant that no longer applies; holds by construction since "
        "multi-tenant-by-schema provisions fresh tenant schemas. Documented in the merged "
        "salesops-customers spec under 'Deliberately NOT part of this contract'.",
    ("2026-08-06-backend-users-roles", "salesops-customers",
     "Self-Service Buyer Authentication Flow"):
        "DEFERRED by owner decision 2026-08-06 (storefront/checkout is frozen LEGACY). "
        "Documented in the merged salesops-customers spec.",
}

# Change folders that are not expected to have reached openspec/specs/ at all.
KNOWN_UNMERGED_CHANGES = {
    "appliances-storefront": "LEGACY, never archived — owner declared it off-limits.",
}


def parse(path):
    out, section = [], "UNSECTIONED"
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            m = SECTION_RE.match(line)
            if m:
                section = m.group(1).upper()
                continue
            m = REQ_RE.match(line)
            if m:
                out.append((section, m.group(1)))
    return out


def norm(s):
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def main():
    targets = []
    for change in sorted(os.listdir(CHANGES)):
        p = os.path.join(CHANGES, change)
        if change == "archive":
            for arch in sorted(os.listdir(p)):
                targets.append(("ARCHIVED", arch, os.path.join(p, arch)))
        elif os.path.isdir(p):
            targets.append(("OPEN", change, p))

    problems, excused, scanned = [], 0, 0

    for status, change, path in targets:
        specs_dir = os.path.join(path, "specs")
        if not os.path.isdir(specs_dir):
            continue
        for capability in sorted(os.listdir(specs_dir)):
            spec_file = os.path.join(specs_dir, capability, "spec.md")
            if not os.path.isfile(spec_file):
                continue
            scanned += 1
            merged_path = os.path.join(SPECS, capability, "spec.md")
            if not os.path.isfile(merged_path):
                if change in KNOWN_UNMERGED_CHANGES:
                    excused += 1
                    continue
                problems.append(
                    f"[{status}] {change} :: {capability} — capability has NO merged spec.md"
                )
                continue
            merged = {norm(n) for _, n in parse(merged_path)}
            for section, name in parse(spec_file):
                present = norm(name) in merged
                bad = (section in ("ADDED", "MODIFIED", "UNSECTIONED") and not present) or (
                    section == "REMOVED" and present
                )
                if not bad:
                    continue
                if (change, capability, name) in KNOWN_EXCEPTIONS:
                    excused += 1
                    continue
                why = "MISSING from merged" if section != "REMOVED" else "still PRESENT in merged"
                problems.append(f"[{status}] {change} :: {capability} — ({section}) {name} → {why}")

    print(f"Delta spec files scanned: {scanned}")
    print(f"Known documented exceptions: {excused}")
    if problems:
        print(f"\nUNMERGED / INCONSISTENT REQUIREMENTS: {len(problems)}\n")
        for p in problems:
            print(f"  {p}")
        return 1
    print("\nClean — every delta requirement is accounted for in openspec/specs/.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
