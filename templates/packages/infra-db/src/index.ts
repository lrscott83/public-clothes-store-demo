export { PrismaService } from './prisma-client.js';
export { InfraDbModule } from './infra-db.module.js';
export type { PrismaClient } from '../generated/client/client.js';
// Task 3.4/3.5 (WU3b): master + temporary tenant-labeled clients — see
// `TenantDefaultPrismaService`'s doc comment for why it still wraps the OLD
// generated client, not `generated/tenant`.
export { PrismaMasterService } from './master-prisma-client.js';
export { TenantDefaultPrismaService } from './tenant/tenant-default-prisma.service.js';
// Task 4.1/4.2 (Phase 4, D2/D6/D7): real per-tenant client acquisition.
export {
  TenantPrismaFactory,
  type TenantPrismaFactoryOptions,
} from './tenant/tenant-prisma-factory.js';
export {
  TenantContextService,
  TenantContextNotActiveError,
  type TenantContext,
} from './tenant/tenant-context.service.js';
export { TenantDatabaseService } from './tenant/tenant-database.service.js';
export { PrismaMembershipRepository } from './company/prisma-membership.repository.js';
export { PrismaProvisioningIncidentRepository } from './company/prisma-provisioning-incident.repository.js';
export { PrismaCurrencyRepository } from './currency/prisma-currency.repository.js';
export { PrismaCategoryRepository } from './product/prisma-category.repository.js';
export { PrismaProductRepository } from './product/prisma-product.repository.js';
export { copyCatalog, type CopyCatalogResult } from './product/copy-catalog.js';
export { seedTemplateCatalog } from './product/seed.js';
export { PrismaWarehouseRepository } from './inventory/prisma-warehouse.repository.js';
export { PrismaStockLevelRepository } from './inventory/prisma-stock-level.repository.js';
export { PrismaStockMovementRepository } from './inventory/prisma-stock-movement.repository.js';
export { PrismaCustomerRepository } from './customer/prisma-customer.repository.js';
export { PrismaOrderRepository } from './sales/prisma-order.repository.js';
export { PrismaUserRepository } from './users/prisma-user.repository.js';
export { PrismaRefreshTokenRepository } from './users/prisma-refresh-token.repository.js';
export { PrismaPasswordResetTokenRepository } from './users/prisma-password-reset-token.repository.js';
export { PrismaWarehouseOperatorRepository } from './users/prisma-warehouse-operator.repository.js';
export { PrismaCompanyRepository } from './company/prisma-company.repository.js';
export { PrismaCompanyUserRepository } from './company/prisma-company-user.repository.js';
export { seedCompany, DEFAULT_COMPANY_SLUG } from './company/seed.js';
export { PrismaCommissionReferenceProvider } from './commission/prisma-commission-reference.provider.js';
export { PrismaCommissionAccrualRepository } from './commission/prisma-commission-accrual.repository.js';
export { PrismaCommissionPaymentRepository } from './commission/prisma-commission-payment.repository.js';
