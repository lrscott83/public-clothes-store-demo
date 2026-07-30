-- Migration B of three for the sales-agents-commissions change. LAST, and the
-- one that stops being reversible.
--
-- Creates the commission ledger: what a product earns (reference), what one
-- delivered order earned one agent (accrual + its frozen lines), what could not
-- be computed (unresolved), and what has been settled (payment).
--
-- READ BEFORE ROLLING BACK. Rollback B is `DROP TABLE` x5 and is safe ONLY
-- while the tables are empty -- which is true at the moment this is first
-- applied, and rehearsed on a throwaway clone before it was. The moment a
-- single `commission_payment` row exists, that rollback destroys a financial
-- record: proof that a person was paid. From that point the ONLY acceptable
-- rollback is to revert the CODE and leave these tables inert. This constraint
-- governs every future hotfix to this module, not just today's apply.
--
-- No seed lives in this file. Product ids are `gen_random_uuid()`-minted at
-- product-seed time, so name->id resolution cannot be expressed in static SQL.
-- The reference seed is `packages/infra-db/src/commission/seed.ts`, run
-- separately -- the same split every other `<concept>/seed.ts` already uses.

-- 1. Reference. PK == FK: exactly 0..1 per product, enforced structurally
-- rather than by a "pick the latest row" convention nobody would remember.
CREATE TABLE "product_commission_reference" (
  "product_id" UUID NOT NULL,
  "amount_mn"  DECIMAL(18,2) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_commission_reference_pkey" PRIMARY KEY ("product_id")
);

ALTER TABLE "product_commission_reference"
  ADD CONSTRAINT "product_commission_reference_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "product"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. Accrual. The UNIQUE on order_id IS the idempotency guarantee: delivering
-- the same order twice, or retrying after a partial failure, cannot produce a
-- second accrual. RESTRICT on both FKs -- an accrual is evidence of earnings,
-- so neither retiring an agent nor touching an order may erase it.
CREATE TABLE "commission_accrual" (
  "id"                         UUID NOT NULL,
  "order_id"                   UUID NOT NULL,
  "attributed_company_user_id" UUID NOT NULL,
  "total"                      DECIMAL(18,2) NOT NULL,
  "accrued_at"                 TIMESTAMP(3) NOT NULL,
  "created_at"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                 TIMESTAMP(3) NOT NULL,
  CONSTRAINT "commission_accrual_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "commission_accrual_order_id_key" ON "commission_accrual"("order_id");
CREATE INDEX "commission_accrual_attributed_company_user_id_idx"
  ON "commission_accrual"("attributed_company_user_id");

ALTER TABLE "commission_accrual"
  ADD CONSTRAINT "commission_accrual_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "sales_order"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "commission_accrual"
  ADD CONSTRAINT "commission_accrual_attributed_company_user_id_fkey"
  FOREIGN KEY ("attributed_company_user_id") REFERENCES "company_user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Resolved lines. CASCADE from the accrual because a line has no meaning
-- apart from it -- unlike a payment, this is detail, not evidence.
CREATE TABLE "commission_accrual_line" (
  "id"              UUID NOT NULL,
  "accrual_id"      UUID NOT NULL,
  "order_line_id"   UUID NOT NULL,
  "product_id"      UUID NOT NULL,
  "quantity"        INTEGER NOT NULL,
  "unit_commission" DECIMAL(18,2) NOT NULL,
  "line_commission" DECIMAL(18,2) NOT NULL,
  CONSTRAINT "commission_accrual_line_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "commission_accrual_line_accrual_id_order_line_id_key"
  ON "commission_accrual_line"("accrual_id", "order_line_id");

ALTER TABLE "commission_accrual_line"
  ADD CONSTRAINT "commission_accrual_line_accrual_id_fkey"
  FOREIGN KEY ("accrual_id") REFERENCES "commission_accrual"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Unresolved lines. A product with no configured commission is UNKNOWN, not
-- free. Kept out of the accrual total and recorded here so a report can surface
-- it as missing configuration instead of as zero earnings.
CREATE TABLE "commission_accrual_unresolved" (
  "id"            UUID NOT NULL,
  "accrual_id"    UUID NOT NULL,
  "order_line_id" UUID NOT NULL,
  "product_id"    UUID NOT NULL,
  "quantity"      INTEGER NOT NULL,
  CONSTRAINT "commission_accrual_unresolved_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "commission_accrual_unresolved_accrual_id_order_line_id_key"
  ON "commission_accrual_unresolved"("accrual_id", "order_line_id");

ALTER TABLE "commission_accrual_unresolved"
  ADD CONSTRAINT "commission_accrual_unresolved_accrual_id_fkey"
  FOREIGN KEY ("accrual_id") REFERENCES "commission_accrual"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Payment. UNIQUE accrual_id: an accrual is settled once or not at all.
-- RESTRICT, not CASCADE -- this row is the proof a person was paid, and it must
-- not disappear as a side effect of deleting anything else.
-- Nothing in this table references `sales_order`: paying an agent is not a
-- change to the customer's order.
CREATE TABLE "commission_payment" (
  "id"                          UUID NOT NULL,
  "accrual_id"                  UUID NOT NULL,
  "amount"                      DECIMAL(18,2) NOT NULL,
  "paid_at"                     TIMESTAMP(3) NOT NULL,
  "recorded_by_company_user_id" UUID NOT NULL,
  "note"                        TEXT,
  "created_at"                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commission_payment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "commission_payment_accrual_id_key" ON "commission_payment"("accrual_id");

ALTER TABLE "commission_payment"
  ADD CONSTRAINT "commission_payment_accrual_id_fkey"
  FOREIGN KEY ("accrual_id") REFERENCES "commission_accrual"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rollback B (rehearsed forward-and-back on a throwaway clone before this was
-- applied for real; drop order is reverse-FK-dependency):
--
--   DROP TABLE "commission_payment";
--   DROP TABLE "commission_accrual_unresolved";
--   DROP TABLE "commission_accrual_line";
--   DROP TABLE "commission_accrual";
--   DROP TABLE "product_commission_reference";
--
-- SAFE ONLY WHILE EMPTY. See the header.
