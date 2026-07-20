-- CreateEnum
CREATE TYPE "PaymentChannel" AS ENUM ('ZELLE', 'USD_EFECTIVO', 'EUR_EFECTIVO', 'MN_TRANSFERENCIA', 'MN_EFECTIVO');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('USD', 'EUR', 'MN');

-- CreateTable
CREATE TABLE "exchange_rate" (
    "id" UUID NOT NULL,
    "channel" "PaymentChannel" NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exchange_rate_channel_effective_from_idx" ON "exchange_rate"("channel", "effective_from");
