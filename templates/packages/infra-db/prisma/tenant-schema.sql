-- GENERATED FILE — do not hand-edit.
-- Regenerate with: node scripts/generate-tenant-schema-sql.ts
-- Source: prisma/tenant/schema.prisma
--
-- Schema-unqualified DDL. The caller MUST `SET search_path` to the target
-- tenant schema before applying this file (design.md D6/D7) — it is not
-- scoped to any schema on its own.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PaymentChannel" AS ENUM ('ZELLE', 'USD_CASH', 'EUR_CASH', 'MN_TRANSFER', 'MN_CASH');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('USD', 'EUR', 'MN');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('purchase_in', 'sale_out', 'transfer_in', 'transfer_out', 'adjustment_in', 'adjustment_out');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('created', 'verified', 'delivered', 'cancelled');

-- CreateEnum
CREATE TYPE "DeliveryMode" AS ENUM ('pickup', 'delivery');

-- CreateTable
CREATE TABLE "exchange_rate" (
    "id" UUID NOT NULL,
    "channel" "PaymentChannel" NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "image" TEXT,
    "icon" TEXT,
    "order" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sku" TEXT,
    "barcode" TEXT,
    "price" DECIMAL(18,2) NOT NULL,
    "price_currency" TEXT NOT NULL,
    "percent_discount_price" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "discount_price" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cost" DECIMAL(18,2) NOT NULL,
    "cost_currency" TEXT NOT NULL,
    "category_id" UUID NOT NULL,
    "image" TEXT NOT NULL,
    "is_new" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_level" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "on_hand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_level_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movement" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer" (
    "id" UUID NOT NULL,
    "company_user_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "document_id" TEXT,
    "cell_phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "customer_name" TEXT NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "delivery_mode" "DeliveryMode" NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'created',
    "subtotal" DECIMAL(18,2) NOT NULL,
    "discount_total" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "attributed_company_user_id" UUID,
    "order_date" TIMESTAMP(3) NOT NULL,
    "verified_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_commission_reference" (
    "product_id" UUID NOT NULL,
    "amount_mn" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_commission_reference_pkey" PRIMARY KEY ("product_id")
);

-- CreateTable
CREATE TABLE "commission_accrual" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "attributed_company_user_id" UUID NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "accrued_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_accrual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_accrual_line" (
    "id" UUID NOT NULL,
    "accrual_id" UUID NOT NULL,
    "order_line_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_commission" DECIMAL(18,2) NOT NULL,
    "line_commission" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "commission_accrual_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_accrual_unresolved" (
    "id" UUID NOT NULL,
    "accrual_id" UUID NOT NULL,
    "order_line_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "commission_accrual_unresolved_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_payment" (
    "id" UUID NOT NULL,
    "accrual_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "recorded_by_company_user_id" UUID NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_line" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "product_name" TEXT NOT NULL,
    "category_name" TEXT NOT NULL,
    "price" DECIMAL(18,2) NOT NULL,
    "price_currency" TEXT NOT NULL,
    "percent_discount_price" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "discount_price" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL,
    "unit_final_price" DECIMAL(18,2) NOT NULL,
    "line_total_native" DECIMAL(18,2) NOT NULL,
    "rate_applied" DECIMAL(18,6) NOT NULL,
    "rate_channel" "PaymentChannel" NOT NULL,
    "rate_effective_from" TIMESTAMP(3) NOT NULL,
    "line_total_order" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_payment" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "channel" "PaymentChannel" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "rate_applied" DECIMAL(18,6) NOT NULL,
    "rate_channel" "PaymentChannel" NOT NULL,
    "rate_effective_from" TIMESTAMP(3) NOT NULL,
    "amount_in_order_currency" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_credit" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "paid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "rate_applied" DECIMAL(18,6) NOT NULL,
    "rate_channel" "PaymentChannel" NOT NULL,
    "rate_effective_from" TIMESTAMP(3) NOT NULL,
    "paid_date" TIMESTAMP(3),
    "paid_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sale_credit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_operator" (
    "company_user_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouse_operator_pkey" PRIMARY KEY ("company_user_id")
);

-- CreateTable
CREATE TABLE "company_user" (
    "id" UUID NOT NULL,
    "role" INTEGER NOT NULL,
    "created_by_company_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_user_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exchange_rate_channel_effective_from_idx" ON "exchange_rate"("channel", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "category_slug_key" ON "category"("slug");

-- CreateIndex
CREATE INDEX "product_category_id_idx" ON "product"("category_id");

-- CreateIndex
CREATE INDEX "stock_level_warehouse_id_idx" ON "stock_level"("warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_level_product_id_warehouse_id_key" ON "stock_level"("product_id", "warehouse_id");

-- CreateIndex
CREATE INDEX "stock_movement_product_id_warehouse_id_idx" ON "stock_movement"("product_id", "warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_company_user_id_key" ON "customer"("company_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_document_id_key" ON "customer"("document_id");

-- CreateIndex
CREATE INDEX "sales_order_customer_id_idx" ON "sales_order"("customer_id");

-- CreateIndex
CREATE INDEX "sales_order_attributed_company_user_id_idx" ON "sales_order"("attributed_company_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "commission_accrual_order_id_key" ON "commission_accrual"("order_id");

-- CreateIndex
CREATE INDEX "commission_accrual_attributed_company_user_id_idx" ON "commission_accrual"("attributed_company_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "commission_accrual_line_accrual_id_order_line_id_key" ON "commission_accrual_line"("accrual_id", "order_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "commission_accrual_unresolved_accrual_id_order_line_id_key" ON "commission_accrual_unresolved"("accrual_id", "order_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "commission_payment_accrual_id_key" ON "commission_payment"("accrual_id");

-- CreateIndex
CREATE INDEX "commission_payment_recorded_by_company_user_id_idx" ON "commission_payment"("recorded_by_company_user_id");

-- CreateIndex
CREATE INDEX "order_line_order_id_idx" ON "order_line"("order_id");

-- CreateIndex
CREATE INDEX "order_payment_order_id_idx" ON "order_payment"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_credit_order_id_key" ON "sale_credit"("order_id");

-- CreateIndex
CREATE INDEX "warehouse_operator_warehouse_id_idx" ON "warehouse_operator"("warehouse_id");

-- CreateIndex
CREATE INDEX "company_user_created_by_company_user_id_idx" ON "company_user"("created_by_company_user_id");

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_level" ADD CONSTRAINT "stock_level_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_level" ADD CONSTRAINT "stock_level_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer" ADD CONSTRAINT "customer_company_user_id_fkey" FOREIGN KEY ("company_user_id") REFERENCES "company_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order" ADD CONSTRAINT "sales_order_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order" ADD CONSTRAINT "sales_order_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order" ADD CONSTRAINT "sales_order_attributed_company_user_id_fkey" FOREIGN KEY ("attributed_company_user_id") REFERENCES "company_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_commission_reference" ADD CONSTRAINT "product_commission_reference_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_accrual" ADD CONSTRAINT "commission_accrual_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_accrual" ADD CONSTRAINT "commission_accrual_attributed_company_user_id_fkey" FOREIGN KEY ("attributed_company_user_id") REFERENCES "company_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_accrual_line" ADD CONSTRAINT "commission_accrual_line_accrual_id_fkey" FOREIGN KEY ("accrual_id") REFERENCES "commission_accrual"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_accrual_unresolved" ADD CONSTRAINT "commission_accrual_unresolved_accrual_id_fkey" FOREIGN KEY ("accrual_id") REFERENCES "commission_accrual"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_payment" ADD CONSTRAINT "commission_payment_accrual_id_fkey" FOREIGN KEY ("accrual_id") REFERENCES "commission_accrual"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_payment" ADD CONSTRAINT "commission_payment_recorded_by_company_user_id_fkey" FOREIGN KEY ("recorded_by_company_user_id") REFERENCES "company_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_line" ADD CONSTRAINT "order_line_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_line" ADD CONSTRAINT "order_line_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_payment" ADD CONSTRAINT "order_payment_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_credit" ADD CONSTRAINT "sale_credit_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_credit" ADD CONSTRAINT "sale_credit_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_operator" ADD CONSTRAINT "warehouse_operator_company_user_id_fkey" FOREIGN KEY ("company_user_id") REFERENCES "company_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_operator" ADD CONSTRAINT "warehouse_operator_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_user" ADD CONSTRAINT "company_user_created_by_company_user_id_fkey" FOREIGN KEY ("created_by_company_user_id") REFERENCES "company_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddCheck (defense-in-depth backstop for the guarded conditional UPDATE in
-- PrismaStockMovementRepository.record — design.md decision #4). Prisma has
-- no CHECK construct; hand-appended per this repo's convention, mirroring
-- prisma/migrations/20260721201406_add_inventory_module/migration.sql.
ALTER TABLE "stock_level" ADD CONSTRAINT "stock_level_non_negative_check" CHECK ("on_hand" >= 0 AND "reserved" >= 0);

-- Defense-in-depth DB invariant (SDD follow-up W4): `reserved` can never
-- exceed `on_hand`. An IMMEDIATE (non-deferrable) CHECK — evaluated on
-- EVERY row modification, not at COMMIT. Hand-appended per this repo's
-- convention, mirroring
-- prisma/migrations/20260723000000_stock_level_reserved_le_onhand/migration.sql.
ALTER TABLE "stock_level"
  ADD CONSTRAINT "stock_level_reserved_le_on_hand_check" CHECK ("reserved" <= "on_hand");
