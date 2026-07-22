-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('creado', 'verificado', 'entregado', 'cancelado');

-- CreateEnum
CREATE TYPE "DeliveryMode" AS ENUM ('recogida', 'domicilio');

-- CreateTable
CREATE TABLE "sales_order" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "customer_name" TEXT NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "delivery_mode" "DeliveryMode" NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'creado',
    "subtotal" DECIMAL(18,2) NOT NULL,
    "discount_total" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "order_date" TIMESTAMP(3) NOT NULL,
    "verified_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_order_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE INDEX "sales_order_customer_id_idx" ON "sales_order"("customer_id");

-- CreateIndex
CREATE INDEX "order_line_order_id_idx" ON "order_line"("order_id");

-- CreateIndex
CREATE INDEX "order_payment_order_id_idx" ON "order_payment"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_credit_order_id_key" ON "sale_credit"("order_id");

-- AddForeignKey
ALTER TABLE "sales_order" ADD CONSTRAINT "sales_order_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order" ADD CONSTRAINT "sales_order_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
