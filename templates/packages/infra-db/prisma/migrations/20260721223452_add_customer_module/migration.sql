-- CreateTable
CREATE TABLE "customer" (
    "id" UUID NOT NULL,
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

-- CreateIndex
CREATE UNIQUE INDEX "customer_document_id_key" ON "customer"("document_id");
