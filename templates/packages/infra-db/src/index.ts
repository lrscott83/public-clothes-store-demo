export { InfraDbModule } from './infra-db.module.js';
export type { PrismaClient as TenantPrismaClient } from '../generated/tenant/client.js';
export type { PrismaClient as MasterPrismaClient } from '../generated/master/client.js';
// Task 3.4/3.5 (WU3b): the master client. `PrismaService`/
// `TenantDefaultPrismaService` (the pre-split monolith client and its
// legacy-cleanup-only sibling) were deleted in task 14.2 once
// `prisma/schema.prisma`'s legacy schema+migrations were replaced by
// `prisma/master/schema.prisma` as the package's default — every consumer
// that used to bind either now binds `PrismaMasterService` or a resolved
// tenant client instead.
export { PrismaMasterService } from './master-prisma-client.js';
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
// Task 10.2 (Phase 10, D7): the provisioning saga (`apps/api-idp/src/company/`)
// is the first consumer of this helper OUTSIDE `infra-db` itself.
export { schemaNameFor, assertSchemaName } from './tenant/schema-name.js';
// The schema-currency probe and the PER-TENANT gate built on it (design D6,
// CLASS F1). Tenant schemas evolve only via a manual
// `node scripts/tenant-migrate.ts`, and a build depending on new DDL should
// say so rather than 500 on an unrelated endpoint later.
//
// `reportTenantSchemaCurrency` is what `apps/api-salesops/src/main.ts` calls
// at boot: it LOGS and returns, in every mode, and can never refuse boot.
// `TenantSchemaCurrencyService` is the gate — `TenantContextGuard` calls it
// per request with the request's own schema, so at `enforce` a stale tenant
// fails its OWN requests and nobody else's. See the module's doc comment for
// the two designs this replaced and why each was worse than the problem.
export {
  REQUIRED_TENANT_ENUM_LABELS,
  SCHEMA_CURRENCY_ENV,
  TenantSchemaBehindError,
  TenantSchemaCurrencyService,
  UnknownSchemaCurrencyModeError,
  describeEnumLabelGaps,
  findEnumLabelGaps,
  reportTenantSchemaCurrency,
  resolveSchemaCurrencyMode,
  surveyTenantSchemaCurrency,
  type EnumLabelGap,
  type SchemaCurrencyMode,
  type SchemaCurrencyStatus,
  type SchemaCurrencySurvey,
  type TenantEnumLabelRow,
  type TenantSchemaCurrencyOptions,
} from './tenant/tenant-schema-currency.js';
// The lock budget and the translation of the two failures explicit locking
// makes reachable (`P2028`, `40P01`, plus the server-side `55P03`/`57014`
// ceilings that enforce the budget). Exported so an app can assert the
// contract without reaching into `src/`.
export {
  LOCK_TRANSACTION_BUDGET,
  TENANT_LOCK_TIMEOUT_MS,
  TENANT_STATEMENT_TIMEOUT_MS,
} from './lock-budget.js';
export {
  translateTransactionError,
  withTransactionErrorMapping,
} from './transaction-errors.js';
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
export { DEFAULT_COMPANY_SLUG, DEFAULT_COMPANY_NAME } from './company/seed.js';
// Task 14.2: the demo-seed provisioning/role-grant primitives `prisma/seed.js` uses.
export { provisionCompany, type ProvisionCompanyResult } from './company/provision-company.js';
export { grantTenantRole, type GrantTenantRoleResult } from './company/grant-tenant-role.js';
export { PrismaCommissionReferenceProvider } from './commission/prisma-commission-reference.provider.js';
export { PrismaCommissionAccrualRepository } from './commission/prisma-commission-accrual.repository.js';
export { PrismaCommissionPaymentRepository } from './commission/prisma-commission-payment.repository.js';
// SDD change `delivery`, Phase 3 (Slice B1): tenant-side Delivery adapters.
export { PrismaCarrierRepository } from './delivery/prisma-carrier.repository.js';
export { PrismaCarrierWarehouseRepository } from './delivery/prisma-carrier-warehouse.repository.js';
export { PrismaDeliveryAssignmentRepository } from './delivery/prisma-delivery-assignment.repository.js';
export { seedCarriers } from './delivery/seed.js';
