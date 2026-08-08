import { Module } from '@nestjs/common';
import { CUSTOMER_REPOSITORY, MEMBERSHIP_REPOSITORY, USER_REPOSITORY } from '@store-mgmt/domain';
import {
  InfraDbModule,
  PrismaCustomerRepository,
  PrismaMembershipRepository,
  PrismaUserRepository,
} from '@store-mgmt/infra-db';
import { CustomerIdentityController } from './customer-identity.controller.js';
import { CustomerIdentityService } from './customer-identity.service.js';
import { CustomerController } from './customer.controller.js';
import { CustomerService } from './customer.service.js';

/**
 * `USER_REPOSITORY` is bound HERE as well as in `AuthModule`. Not a
 * redundancy: Nest DI is module-scoped and (pre-Phase-8) `AuthModule`
 * exported nothing, so its bindings were invisible from this module. Binding
 * per-module is the pattern every feature module in this app already follows
 * (see `SalesModule`), and the adapters are stateless wrappers over the
 * `PrismaMasterService`/tenant client `InfraDbModule` provides.
 *
 * `COMPANY_USER_REPOSITORY`/`PrismaCompanyUserRepository` dropped (Phase 8,
 * task 8.3): `CustomerIdentityService` was this module's only consumer, and
 * it now writes the tenant `CompanyUser` row directly through
 * `TenantContextService` (already exported by `InfraDbModule`, already
 * imported below) instead — see that service's doc comment for why.
 */
@Module({
  imports: [InfraDbModule],
  controllers: [CustomerController, CustomerIdentityController],
  providers: [
    CustomerService,
    CustomerIdentityService,
    { provide: CUSTOMER_REPOSITORY, useClass: PrismaCustomerRepository },
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    // Master-side: the ACTIVE Membership half of the access grant that
    // `CustomerIdentityService` writes alongside the tenant `CompanyUser`.
    { provide: MEMBERSHIP_REPOSITORY, useClass: PrismaMembershipRepository },
  ],
})
export class CustomerModule {}
