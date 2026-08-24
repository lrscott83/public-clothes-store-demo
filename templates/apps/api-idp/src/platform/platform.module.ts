import { Module } from '@nestjs/common';
import {
  COMPANY_REPOSITORY,
  MEMBERSHIP_REPOSITORY,
  PROVISIONING_INCIDENT_REPOSITORY,
  USER_REPOSITORY,
} from '@store-mgmt/domain';
import {
  InfraDbModule,
  PrismaCompanyRepository,
  PrismaMembershipRepository,
  PrismaProvisioningIncidentRepository,
  PrismaUserRepository,
} from '@store-mgmt/infra-db';
import { CreateCompanySaga } from '../company/create-company.saga.js';
import { PlatformController } from './platform.controller.js';
import { PlatformService } from './platform.service.js';

/**
 * Platform superadmin surface (design D1/D2/D3) — superadmin-gated company
 * list + create-on-behalf endpoints. Lives OUTSIDE every tenant: no
 * `TenantContextGuard`/`RolesGuard` anywhere in its chain. Binds the ports
 * `PlatformService` composes plus the FULL set the untouched
 * `CreateCompanySaga` needs (mirroring `CompanyModule`, which does not
 * export the saga).
 */
@Module({
  imports: [InfraDbModule],
  controllers: [PlatformController],
  providers: [
    PlatformService,
    CreateCompanySaga,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: COMPANY_REPOSITORY, useClass: PrismaCompanyRepository },
    { provide: MEMBERSHIP_REPOSITORY, useClass: PrismaMembershipRepository },
    { provide: PROVISIONING_INCIDENT_REPOSITORY, useClass: PrismaProvisioningIncidentRepository },
  ],
})
export class PlatformModule {}
