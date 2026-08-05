import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  Company as DomainCompany,
  ICompanyRepository,
  IMembershipRepository,
  IProvisioningIncidentRepository,
} from '@store-mgmt/domain';
import {
  COMPANY_REPOSITORY,
  MEMBERSHIP_REPOSITORY,
  PROVISIONING_INCIDENT_REPOSITORY,
  USER_ROLES,
  createCompany,
  createTenantCompanyUser,
} from '@store-mgmt/domain';
import {
  copyCatalog,
  schemaNameFor,
  type CopyCatalogResult,
  PrismaMasterService,
  TenantContextService,
  TenantDatabaseService,
} from '@store-mgmt/infra-db';

export interface CreateCompanySagaInput {
  readonly name: string;
  readonly slug: string;
  /** Master `User.id` of the company's first member — becomes the tenant `CompanyUser` with the `owner` role. */
  readonly ownerId: string;
}

export interface CreateCompanySagaResult {
  readonly companyId: string;
  readonly schemaName: string;
  readonly ownerCompanyUserId: string;
  readonly categoriesCopied: number;
  readonly productsCopied: number;
}

/** Compensation state — only what actually happened is undone (reverse order). */
interface CompensationState {
  readonly companyId: string | undefined;
  readonly schemaName: string | undefined;
  readonly schemaCreated: boolean;
  readonly schemaNameSet: boolean;
  readonly membershipId: string | undefined;
  readonly ownerCompanyUserId: string | undefined;
}

/**
 * Provisioning saga (design.md D7) — the ONLY place a `Company` gets a
 * working tenant. Six steps, none of them one transaction (DDL plus two
 * Postgres schemas cannot be): (1) create the master `Company`, `schemaName`
 * NULL; (2) `CREATE SCHEMA` + apply the tenant DDL; (3) set
 * `Company.schemaName`; (4) an ACTIVE master `Membership` for the owner; (5)
 * the owner's tenant `CompanyUser`; (6) copy the master catalog templates
 * into the tenant (Phase 9), AWAITED — so a caller never sees a response
 * with an owner but an empty catalog (the window poolops's
 * `void seedNewCompany(...)` leaves open, landmine 5).
 *
 * Any step's failure compensates every step that ACTUALLY SUCCEEDED, in
 * reverse order (5, 4, 3, 2, 1). A failing compensation step is not trusted
 * silently: it is caught, recorded as a `ProvisioningIncident` in master,
 * and the loop keeps going — the remaining compensations still run.
 * `scripts/tenant-orphan-sweep.ts` (task 10.3) reconciles whatever
 * compensation itself could not undo. poolops only logs (landmine 5).
 */
@Injectable()
export class CreateCompanySaga {
  private readonly logger = new Logger(CreateCompanySaga.name);

  constructor(
    @Inject(COMPANY_REPOSITORY) private readonly companyRepository: ICompanyRepository,
    @Inject(MEMBERSHIP_REPOSITORY) private readonly membershipRepository: IMembershipRepository,
    @Inject(PROVISIONING_INCIDENT_REPOSITORY)
    private readonly provisioningIncidentRepository: IProvisioningIncidentRepository,
    private readonly tenantDatabaseService: TenantDatabaseService,
    private readonly tenantContext: TenantContextService,
    private readonly masterPrisma: PrismaMasterService,
  ) {}

  async run(input: CreateCompanySagaInput): Promise<CreateCompanySagaResult> {
    // Invariant check only, discarded — mirrors AuthService.signup / CustomerIdentityService.
    createCompany({ name: input.name, slug: input.slug });

    let company: DomainCompany | undefined;
    let schemaName: string | undefined;
    let schemaCreated = false;
    let schemaNameSet = false;
    let membershipId: string | undefined;
    let ownerCompanyUserId: string | undefined;

    try {
      // Step 1 — master Company, schemaName NULL.
      company = await this.companyRepository.create({ name: input.name, slug: input.slug });

      // Step 2 — CREATE SCHEMA + tenant DDL (D6: search_path is set first, inside TenantDatabaseService).
      schemaName = schemaNameFor(company.id);
      await this.tenantDatabaseService.createSchema(schemaName);
      schemaCreated = true;

      // Step 3 — Company.schemaName = <name>.
      company = await this.companyRepository.setSchemaName(company.id, schemaName);
      schemaNameSet = true;

      // Step 4 — master Membership, ACTIVE.
      const membership = await this.membershipRepository.create({
        userId: input.ownerId,
        companyId: company.id,
        status: 'ACTIVE',
      });
      membershipId = membership.id;

      // Steps 5 & 6 share ONE tenant scope — the owner's tenant CompanyUser,
      // then the catalog copy, AWAITED (design.md D7 step 6 / P9).
      const catalog = await this.tenantContext.run(
        { companyId: company.id, schemaName },
        async (): Promise<CopyCatalogResult> => {
          // Step 5 — tenant CompanyUser (owner role). Invariant check only,
          // discarded (mirrors CustomerIdentityService, Phase 8) — no
          // repository port exists for tenant CompanyUser writes.
          createTenantCompanyUser({ id: input.ownerId, role: USER_ROLES.owner, createdByCompanyUserId: null });
          const created = await this.tenantContext.getClient().companyUser.create({
            data: { id: input.ownerId, role: USER_ROLES.owner, createdByCompanyUserId: null },
          });
          // Recorded immediately — must survive even if step 6 fails right after this.
          ownerCompanyUserId = created.id;

          // Step 6 — copy the master catalog templates into the tenant, AWAITED (P9).
          return this.copyCatalog(this.masterPrisma, this.tenantContext.getClient());
        },
      );

      return {
        companyId: company.id,
        schemaName,
        ownerCompanyUserId: ownerCompanyUserId as string,
        categoriesCopied: catalog.categoriesCopied,
        productsCopied: catalog.productsCopied,
      };
    } catch (err) {
      await this.compensate({
        companyId: company?.id,
        schemaName,
        schemaCreated,
        schemaNameSet,
        membershipId,
        ownerCompanyUserId,
      });
      throw err;
    }
  }

  /**
   * Thin seam over the Phase 9 primitive so specs can stub the catalog copy
   * without a real Postgres tenant schema — `copyCatalog` itself is already
   * proven against real Postgres (`copy-catalog.spec.ts`). Production always
   * delegates to the real function; only tests override this method.
   */
  protected copyCatalog(
    master: PrismaMasterService,
    tenant: ReturnType<TenantContextService['getClient']>,
  ): Promise<CopyCatalogResult> {
    return copyCatalog(master, tenant);
  }

  /**
   * Reverse-order compensation (design.md D7) for whichever steps actually
   * succeeded. Each compensation runs independently — one failing does NOT
   * stop the rest from being attempted.
   */
  private async compensate(state: CompensationState): Promise<void> {
    const { companyId, schemaName, schemaCreated, schemaNameSet, membershipId, ownerCompanyUserId } = state;

    // Step 5's compensation.
    if (ownerCompanyUserId && companyId && schemaName) {
      await this.attemptCompensation(companyId, 'tenant-company-user-rollback', () =>
        this.tenantContext.run({ companyId, schemaName }, () =>
          this.tenantContext.getClient().companyUser.delete({ where: { id: ownerCompanyUserId } }),
        ),
      );
    }

    // Step 4's compensation.
    if (membershipId && companyId) {
      await this.attemptCompensation(companyId, 'membership-rollback', () =>
        this.membershipRepository.delete(membershipId),
      );
    }

    // Step 3's compensation.
    if (schemaNameSet && companyId) {
      await this.attemptCompensation(companyId, 'schema-name-rollback', () =>
        this.companyRepository.setSchemaName(companyId, null),
      );
    }

    // Step 2's compensation.
    if (schemaCreated && companyId && schemaName) {
      await this.attemptCompensation(companyId, 'create-schema-rollback', async () => {
        await this.tenantDatabaseService.deleteSchema(schemaName);
      });
    }

    // Step 1's compensation.
    if (companyId) {
      await this.attemptCompensation(companyId, 'company-rollback', () => this.companyRepository.delete(companyId));
    }
  }

  /**
   * Runs one compensation step. If it throws, the failure is NOT trusted
   * silently: it is recorded as a `ProvisioningIncident` in master so
   * `scripts/tenant-orphan-sweep.ts` (task 10.3) can reconcile it later —
   * and, whatever happens, the REMAINING compensations still get attempted
   * (this method never rethrows).
   */
  private async attemptCompensation(companyId: string, step: string, action: () => Promise<unknown>): Promise<void> {
    try {
      await action();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(`PROVISIONING_COMPENSATION_FAILED: step="${step}" companyId="${companyId}": ${reason}`);
      try {
        await this.provisioningIncidentRepository.create({ companyId, step, reason });
      } catch (incidentErr) {
        // Recording the incident itself failed — the true worst case, with
        // no further fallback (design.md D7). Logged, never thrown: the
        // caller must still see the ORIGINAL saga error, and the remaining
        // compensations must still run.
        const incidentReason = incidentErr instanceof Error ? incidentErr.message : String(incidentErr);
        this.logger.error(
          `PROVISIONING_INCIDENT_WRITE_FAILED: step="${step}" companyId="${companyId}": ${incidentReason}`,
        );
      }
    }
  }
}
