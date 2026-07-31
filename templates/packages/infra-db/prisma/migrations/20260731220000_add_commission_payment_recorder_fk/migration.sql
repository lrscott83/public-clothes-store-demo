-- Who authorised a commission payment is part of the financial record.
--
-- `recorded_by_company_user_id` was created NOT NULL but unconstrained, so it
-- was a free-text UUID: it could name a company user that had been deleted, or
-- one that never existed, and nothing would notice until someone asked who
-- approved a payment and got back an id that resolves to nobody.
--
-- RESTRICT, matching every other edge in this module: the assignment cannot be
-- deleted out from under a payment that names it.

-- Fail loudly rather than silently dropping evidence: if any existing row points
-- at a company user that is not there, the ALTER below raises and the migration
-- stops. Orphans are a data problem to look at, not rows to delete on the way past.

CREATE INDEX IF NOT EXISTS "commission_payment_recorded_by_company_user_id_idx"
  ON "commission_payment"("recorded_by_company_user_id");

ALTER TABLE "commission_payment"
  ADD CONSTRAINT "commission_payment_recorded_by_company_user_id_fkey"
  FOREIGN KEY ("recorded_by_company_user_id") REFERENCES "company_user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
