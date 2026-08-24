-- Task 1.1 (platform-superadmin): ONE additive master migration carrying both
-- new master-side facts (design.md D5):
--   1. `is_superadmin` — the platform superadmin boolean on `app_user`
--      (spec: salesops-identity "Platform Superadmin Flag on Master User").
--      Master-level fact, NOT a bit in the company-scoped `USER_ROLES` mask.
--   2. `CompanyType` enum + nullable `company.type` defaulting to `'catalog'`
--      (spec: salesops-companies "Company Type Metadata Field") — DATA ONLY,
--      no behavioral effect on provisioning or access.
-- Both changes are additive and unread by old code, so this is safe under
-- running old binaries. Generated per the same technique as
-- 20260813120000_product_image_nullable.

-- AlterTable
ALTER TABLE "app_user" ADD COLUMN "is_superadmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateEnum
CREATE TYPE "CompanyType" AS ENUM ('catalog');

-- AlterTable (column stays NULLable — existing rows read NULL; the default
-- applies to inserts that omit `type`)
ALTER TABLE "company" ADD COLUMN "type" "CompanyType" DEFAULT 'catalog';
