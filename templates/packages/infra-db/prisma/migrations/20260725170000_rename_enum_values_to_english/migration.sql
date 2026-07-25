-- Rename Spanish enum values to English across OrderStatus, DeliveryMode and
-- PaymentChannel (ventas-english-rename WU2, naming decisions blocks A/B/C).
--
-- Hand-written: Prisma does not generate `ALTER TYPE ... RENAME VALUE`. Its
-- auto-diff for an enum value rename is a DESTRUCTIVE DROP TYPE + CREATE TYPE
-- (open Prisma v7 regression, prisma/prisma#28843) which would require
-- dropping and recreating every column/table that references the type. That
-- is unacceptable even on a pre-release branch with no production data — it
-- rewrites every row's OID and loses type identity mid-migration history.
--
-- `RENAME VALUE` is safe: Postgres stores enum values by internal OID, not by
-- label text, so every existing row still resolves to the same OID under its
-- new English label — no row rewrite, no backfill, no downtime.
ALTER TYPE "OrderStatus" RENAME VALUE 'creado' TO 'created';
ALTER TYPE "OrderStatus" RENAME VALUE 'verificado' TO 'verified';
ALTER TYPE "OrderStatus" RENAME VALUE 'entregado' TO 'delivered';
ALTER TYPE "OrderStatus" RENAME VALUE 'cancelado' TO 'cancelled';
ALTER TYPE "DeliveryMode" RENAME VALUE 'recogida' TO 'pickup';
ALTER TYPE "DeliveryMode" RENAME VALUE 'domicilio' TO 'delivery';
ALTER TYPE "PaymentChannel" RENAME VALUE 'USD_EFECTIVO' TO 'USD_CASH';
ALTER TYPE "PaymentChannel" RENAME VALUE 'EUR_EFECTIVO' TO 'EUR_CASH';
ALTER TYPE "PaymentChannel" RENAME VALUE 'MN_EFECTIVO' TO 'MN_CASH';
ALTER TYPE "PaymentChannel" RENAME VALUE 'MN_TRANSFERENCIA' TO 'MN_TRANSFER';

-- Same migration also carries the block-F demo-category slug fix (naming
-- decisions #1529/#1537): renaming the slug here, in lockstep with the enum
-- rename, means the NEXT seed run upserts the existing "Ventas Demo" category
-- row by its new slug instead of creating a duplicate row and orphaning the
-- original along with its seeded products.
UPDATE "category" SET slug = 'sales-seed-demo' WHERE slug = 'ventas-seed-demo';
