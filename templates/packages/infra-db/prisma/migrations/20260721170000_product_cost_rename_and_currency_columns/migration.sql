-- RenameColumn
ALTER TABLE "product" RENAME COLUMN "costo_usd" TO "cost";

-- AddColumn (temporary default so existing rows stay valid, then dropped —
-- price/cost currency is REQUIRED going forward, chosen by the caller)
ALTER TABLE "product" ADD COLUMN "price_currency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "product" ADD COLUMN "cost_currency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "product" ALTER COLUMN "price_currency" DROP DEFAULT;
ALTER TABLE "product" ALTER COLUMN "cost_currency" DROP DEFAULT;
