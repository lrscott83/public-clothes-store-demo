-- Task 3.3: adds the master-side tables new to this change — MembershipStatus
-- enum, Membership (D1/D4), TemplateCategory/TemplateProduct (P8/P9),
-- ProvisioningIncident (D7). Generated via
-- `prisma migrate diff --from-schema <baseline> --to-schema prisma/master/schema.prisma --script`
-- against the 20260804140000_baseline_existing_master_tables baseline (design.md file map).


-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'REVOKED', 'SUSPENDED');

-- CreateTable
CREATE TABLE "membership" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_category" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "image" TEXT,
    "icon" TEXT,
    "order" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "template_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_product" (
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

    CONSTRAINT "template_product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provisioning_incident" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "step" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provisioning_incident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "membership_user_id_idx" ON "membership"("user_id");

-- CreateIndex
CREATE INDEX "membership_company_id_idx" ON "membership"("company_id");

-- CreateIndex
CREATE INDEX "membership_status_idx" ON "membership"("status");

-- CreateIndex
CREATE UNIQUE INDEX "membership_user_id_company_id_key" ON "membership"("user_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "template_category_slug_key" ON "template_category"("slug");

-- CreateIndex
CREATE INDEX "template_product_category_id_idx" ON "template_product"("category_id");

-- CreateIndex
CREATE INDEX "provisioning_incident_company_id_idx" ON "provisioning_incident"("company_id");

-- CreateIndex
CREATE INDEX "provisioning_incident_resolved_at_idx" ON "provisioning_incident"("resolved_at");

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_product" ADD CONSTRAINT "template_product_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "template_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

