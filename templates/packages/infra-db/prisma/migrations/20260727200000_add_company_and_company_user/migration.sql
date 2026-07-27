-- Companies / CompanyUser role reframe, migration 001 of 2 (SDD change
-- company-user-roles-reframe, design.md §7/D7). ADDITIVE + BACKFILL ONLY —
-- `app_user.roles` is left completely intact and remains the live source of
-- authorization until the Phase 2 behavioral cutover ships. This migration
-- ships WITH that Phase 2 code, but is intentionally its own migration so it
-- can be reasoned about (and, if ever needed, rolled back) independently of
-- migration 002 (`..._drop_app_user_roles`), which only runs after the §7
-- verification script (`infra-db/scripts/verify-company-user-backfill.ts`)
-- confirms the backfill below is bit-for-bit correct.
--
-- Hand-written: Prisma's auto-diff cannot express "create two tables, seed
-- one row, and backfill every existing user from a column on a different
-- table" as a single generated migration (same reasoning as the
-- `20260723030000_add_users_roles_module` and
-- `20260725170000_rename_enum_values_to_english` precedents).

-- CreateTable company
CREATE TABLE "company" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "schema_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);

-- CreateIndex company.slug
CREATE UNIQUE INDEX "company_slug_key" ON "company"("slug");

-- CreateEnum CompanyUserStatus
CREATE TYPE "CompanyUserStatus" AS ENUM ('ACTIVE', 'REVOKED', 'SUSPENDED');

-- CreateTable company_user
CREATE TABLE "company_user" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "role" INTEGER NOT NULL,
    "status" "CompanyUserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_user_pkey" PRIMARY KEY ("id")
);

-- CreateIndex company_user (user_id has NO FK — soft FK by design, D1)
CREATE UNIQUE INDEX "company_user_user_id_company_id_key" ON "company_user"("user_id", "company_id");
CREATE INDEX "company_user_user_id_idx" ON "company_user"("user_id");

-- AddForeignKey company_user -> company ONLY. NO FK to app_user (D1).
ALTER TABLE "company_user" ADD CONSTRAINT "company_user_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed the single implicit tenant AND backfill every existing user in one
-- statement. The outer INSERT joins the CTE's own RETURNING projection (not
-- the base "company" table), sidestepping the same-snapshot visibility trap
-- documented in the users-roles migration (a plain `FROM "company"` would
-- use the pre-INSERT snapshot and could see zero rows). A data-modifying CTE
-- always runs to completion, so "company" is created even on a fresh DB with
-- zero app_user rows (the backfill then affects 0 rows — correct no-op).
-- `role` is copied VERBATIM from `app_user.roles` so `can()` evaluates
-- bit-for-bit identically pre/post migration — see the §7 verification
-- script, which is the gate before migration 002 may be authored or run.
WITH seeded_company AS (
  INSERT INTO "company" ("id", "name", "slug", "is_active", "created_at", "updated_at")
  VALUES (gen_random_uuid(), 'Tienda Principal', 'default', true, now(), now())
  RETURNING "id"
)
INSERT INTO "company_user" ("id", "user_id", "company_id", "role", "status", "created_at", "updated_at")
SELECT gen_random_uuid(), u."id", c."id", u."roles", 'ACTIVE', now(), now()
FROM "app_user" u CROSS JOIN seeded_company c;
