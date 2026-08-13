-- Task 3.1: makes the master-side product image column nullable, mirroring the
-- same change on the tenant `Product` model (prisma/tenant/schema.prisma).
-- Master's product record is `TemplateProduct` (maps to `template_product`),
-- which is why the affected table below is `template_product`, not `product`.
-- Generated via
-- `prisma migrate diff --from-schema <baseline> --to-schema prisma/master/schema.prisma --script`
-- against a snapshot of `prisma/master/schema.prisma` taken immediately before
-- this task's edit (image: String -> String?), same technique as
-- 20260804140100_add_membership_and_templates.

-- AlterTable
ALTER TABLE "template_product" ALTER COLUMN "image" DROP NOT NULL;
