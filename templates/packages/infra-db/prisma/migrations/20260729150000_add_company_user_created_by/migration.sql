-- Migration C of three for the sales-agents-commissions change.
--
-- Records WHO provisioned a role assignment. A sales agent can now sign a
-- walk-in customer up through `POST /customers/with-identity`, which mints a
-- login and grants it the `user` bit. The assignment IS the privilege grant,
-- so "who granted it" belongs on the row that carries it — not on `customer`
-- (which is master data, not authorization) and not on `app_user` (which the
-- deferred schema-per-tenant split leaves master-side, where this row does not
-- follow).
--
-- Nothing reads this column to make a decision. It is forensics.
--
-- DELIBERATELY NOT BACKFILLED. Existing assignments were created by signup, by
-- an owner through api-idp, or by a seed; the database does not record which,
-- and guessing would manufacture an audit trail. They stay NULL, which reads
-- correctly as "nobody provisioned this" for every one of those origins.

ALTER TABLE "company_user" ADD COLUMN "created_by_company_user_id" UUID;

-- Self-referencing FK. ON DELETE RESTRICT matches every other FK in this
-- schema; `company_user` has no hard-delete path today, so RESTRICT can only
-- ever fire as a loud signal that one was introduced.
ALTER TABLE "company_user" ADD CONSTRAINT "company_user_created_by_company_user_id_fkey"
  FOREIGN KEY ("created_by_company_user_id") REFERENCES "company_user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "company_user_created_by_company_user_id_idx"
  ON "company_user"("created_by_company_user_id");

-- Rollback (rehearsed forward-and-back on a throwaway clone before this was
-- applied for real). Genuinely lossless for everything that predates it, and
-- the only rollback in this change with no caveat attached: it discards
-- provenance captured after the cutover, which is audit data, not operational
-- data. Nothing reads it to make a decision, so dropping it degrades forensics
-- and breaks nothing.
--
--   DROP INDEX "company_user_created_by_company_user_id_idx";
--   ALTER TABLE "company_user" DROP CONSTRAINT "company_user_created_by_company_user_id_fkey";
--   ALTER TABLE "company_user" DROP COLUMN "created_by_company_user_id";
