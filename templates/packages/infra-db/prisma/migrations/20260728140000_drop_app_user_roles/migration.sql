-- Migration 002 of the CompanyUser/roles reframe (design.md §7). Drops the
-- last dual-write column: `company_user.role` becomes the ONLY persisted
-- authorization source.
--
-- PRECONDITION: the §7 backfill gate
-- (`scripts/verify-company-user-backfill.ts`) MUST pass against the target
-- database immediately before this runs — 1 company, one `company_user` per
-- `app_user`, zero role mismatches, zero orphans. This migration is the point
-- of no cheap return: after it, `git revert` alone does not restore the data.
--
-- ROLLBACK (compensating migration, no data lost — `company_user.role` is
-- authoritative and is deliberately left intact here):
--   ALTER TABLE "app_user" ADD COLUMN "roles" INTEGER NOT NULL DEFAULT 1;
--   UPDATE "app_user" u SET "roles" = cu."role"
--     FROM "company_user" cu WHERE cu."user_id" = u."id";
-- then revert the code. Rehearsed on a throwaway clone of `store_mgmt_test`
-- before this migration was authored: forward drop clean, `company_user`
-- intact, every bitmask round-tripped.

ALTER TABLE "app_user" DROP COLUMN "roles";
