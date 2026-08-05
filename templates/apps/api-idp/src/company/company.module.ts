import { Module } from '@nestjs/common';
import { COMPANY_REPOSITORY, MEMBERSHIP_REPOSITORY, PROVISIONING_INCIDENT_REPOSITORY } from '@store-mgmt/domain';
import {
  InfraDbModule,
  PrismaCompanyRepository,
  PrismaMembershipRepository,
  PrismaProvisioningIncidentRepository,
} from '@store-mgmt/infra-db';
import { CompanyController } from './company.controller.js';
import { CreateCompanySaga } from './create-company.saga.js';

/**
 * Owns `CreateCompanySaga` (design.md D7) — the ONLY writer of a `Company`
 * row — and its HTTP caller, `CompanyController`. Binds the three ports the
 * saga needs directly, mirroring `AuthModule`/`UsersModule`'s per-module
 * repository binding convention. `TenantContextService`/`TenantDatabaseService`/
 * `PrismaMasterService` come from `InfraDbModule` (already provided there),
 * not re-bound here.
 */
@Module({
  imports: [InfraDbModule],
  controllers: [CompanyController],
  providers: [
    CreateCompanySaga,
    { provide: COMPANY_REPOSITORY, useClass: PrismaCompanyRepository },
    { provide: MEMBERSHIP_REPOSITORY, useClass: PrismaMembershipRepository },
    { provide: PROVISIONING_INCIDENT_REPOSITORY, useClass: PrismaProvisioningIncidentRepository },
  ],
})
export class CompanyModule {}
