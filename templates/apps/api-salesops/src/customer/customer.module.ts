import { Module } from '@nestjs/common';
import { COMPANY_USER_REPOSITORY, CUSTOMER_REPOSITORY, USER_REPOSITORY } from '@store-mgmt/domain';
import {
  InfraDbModule,
  PrismaCompanyUserRepository,
  PrismaCustomerRepository,
  PrismaUserRepository,
} from '@store-mgmt/infra-db';
import { CustomerIdentityController } from './customer-identity.controller.js';
import { CustomerIdentityService } from './customer-identity.service.js';
import { CustomerController } from './customer.controller.js';
import { CustomerService } from './customer.service.js';

/**
 * `USER_REPOSITORY`/`COMPANY_USER_REPOSITORY` are bound HERE as well as in
 * `AuthModule`. Not a redundancy: Nest DI is module-scoped and `AuthModule`
 * exports nothing, so its bindings are invisible from this module. Binding
 * per-module is the pattern every feature module in this app already follows
 * (see `SalesModule`), and the adapters are stateless wrappers over the single
 * `PrismaService` that `InfraDbModule` provides.
 */
@Module({
  imports: [InfraDbModule],
  controllers: [CustomerController, CustomerIdentityController],
  providers: [
    CustomerService,
    CustomerIdentityService,
    { provide: CUSTOMER_REPOSITORY, useClass: PrismaCustomerRepository },
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: COMPANY_USER_REPOSITORY, useClass: PrismaCompanyUserRepository },
  ],
})
export class CustomerModule {}
