-- Migration A of three for the sales-agents-commissions change.
--
-- Records WHICH sales agent a sale is credited to. Ships with the attribution
-- code, ahead of the commission ledger (migration B), because the ledger's
-- entry gate is "every post-cutover order carries an attribution" and that
-- can only be true once this column has been live and written to.
--
-- DELIBERATELY NOT BACKFILLED. Orders created before this migration have no
-- attributed agent, and picking one for them — the order's creator, the sole
-- active agent, anyone — would fabricate financial evidence about who earned
-- what. They stay NULL and are excluded from accrual, loudly.

ALTER TABLE "sales_order" ADD COLUMN "attributed_company_user_id" UUID;

-- ON DELETE RESTRICT, never SET NULL: nulling this column on delete would
-- silently erase who earned the commission. Retiring an agent is a `status`
-- change on `company_user`, not a delete.
ALTER TABLE "sales_order" ADD CONSTRAINT "sales_order_attributed_company_user_id_fkey"
  FOREIGN KEY ("attributed_company_user_id") REFERENCES "company_user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "sales_order_attributed_company_user_id_idx"
  ON "sales_order"("attributed_company_user_id");

-- Rollback (rehearsed on a throwaway clone before this was applied for real):
--
--   DROP INDEX "sales_order_attributed_company_user_id_idx";
--   ALTER TABLE "sales_order" DROP CONSTRAINT "sales_order_attributed_company_user_id_fkey";
--   ALTER TABLE "sales_order" DROP COLUMN "attributed_company_user_id";
--
-- Lossless for everything that predates this migration, but it DOES discard
-- attribution captured after the cutover. It is therefore only safe while no
-- commission accrual exists — i.e. before migration B has any rows. That
-- ordering is the entire reason these are two migrations and not one.
