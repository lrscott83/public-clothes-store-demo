import type {
  Company,
  ICompanyRepository,
  IMembershipRepository,
  IProvisioningIncidentRepository,
  Membership,
  ProvisioningIncident,
} from '@store-mgmt/domain';
import { USER_ROLES } from '@store-mgmt/domain';
import type { PrismaMasterService, TenantContextService, TenantDatabaseService } from '@store-mgmt/infra-db';
import { CreateCompanySaga } from './create-company.saga.js';

const OWNER_ID = '11111111-1111-1111-1111-111111111111';
const COMPANY_ID = '22222222-2222-2222-2222-222222222222';
const SCHEMA_NAME = 'store_mgmt_tenant_22222222_2222_2222_2222_222222222222';
const MEMBERSHIP_ID = 'membership-1';
const CATALOG_RESULT = { categoriesCopied: 11, productsCopied: 99 };

const TEST_COMPANY: Company = {
  id: COMPANY_ID,
  name: 'Tienda Nueva',
  slug: 'tienda-nueva',
  isActive: true,
  schemaName: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function buildCompanyRepoMock(): jest.Mocked<ICompanyRepository> {
  return {
    list: jest.fn(),
    findById: jest.fn(),
    create: jest.fn().mockResolvedValue(TEST_COMPANY),
    setSchemaName: jest.fn().mockImplementation((id: string, schemaName: string | null) =>
      Promise.resolve({ ...TEST_COMPANY, id, schemaName }),
    ),
    delete: jest.fn().mockResolvedValue(undefined),
  };
}

function buildMembershipRepoMock(): jest.Mocked<IMembershipRepository> {
  return {
    create: jest.fn().mockResolvedValue({
      id: MEMBERSHIP_ID,
      userId: OWNER_ID,
      companyId: COMPANY_ID,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    } satisfies Membership),
    findByUserAndCompany: jest.fn(),
    listActiveByUserId: jest.fn(),
    listByCompany: jest.fn(),
    delete: jest.fn().mockResolvedValue(undefined),
  };
}

function buildProvisioningIncidentRepoMock(): jest.Mocked<IProvisioningIncidentRepository> {
  return {
    create: jest.fn().mockImplementation((input) =>
      Promise.resolve({
        id: 'incident-1',
        resolvedAt: null,
        createdAt: new Date(),
        ...input,
      } as ProvisioningIncident),
    ),
    listUnresolved: jest.fn(),
  };
}

function buildTenantDatabaseServiceMock(): jest.Mocked<Pick<TenantDatabaseService, 'createSchema' | 'deleteSchema' | 'schemaExists'>> {
  return {
    createSchema: jest.fn().mockResolvedValue(undefined),
    deleteSchema: jest.fn().mockResolvedValue(undefined),
    schemaExists: jest.fn(),
  };
}

/** Fake tenant Prisma client — only the `companyUser` model is exercised by the saga. */
function buildFakeTenantClient() {
  return {
    companyUser: {
      create: jest.fn().mockResolvedValue({ id: OWNER_ID, role: USER_ROLES.owner, createdByCompanyUserId: null }),
      delete: jest.fn().mockResolvedValue(undefined),
    },
  };
}

/** Mirrors Phase 8's `mockTenantContextService` convention: `run` calls straight through. */
function buildTenantContextServiceMock(
  tenantClient: ReturnType<typeof buildFakeTenantClient>,
): jest.Mocked<Pick<TenantContextService, 'run' | 'getClient'>> {
  return {
    run: jest.fn((_ctx, fn) => fn()),
    getClient: jest.fn().mockReturnValue(tenantClient),
  } as unknown as jest.Mocked<Pick<TenantContextService, 'run' | 'getClient'>>;
}

describe('CreateCompanySaga', () => {
  let companyRepository: jest.Mocked<ICompanyRepository>;
  let membershipRepository: jest.Mocked<IMembershipRepository>;
  let provisioningIncidentRepository: jest.Mocked<IProvisioningIncidentRepository>;
  let tenantDatabaseService: jest.Mocked<Pick<TenantDatabaseService, 'createSchema' | 'deleteSchema' | 'schemaExists'>>;
  let tenantClient: ReturnType<typeof buildFakeTenantClient>;
  let tenantContext: jest.Mocked<Pick<TenantContextService, 'run' | 'getClient'>>;
  let saga: CreateCompanySaga;

  beforeEach(() => {
    companyRepository = buildCompanyRepoMock();
    membershipRepository = buildMembershipRepoMock();
    provisioningIncidentRepository = buildProvisioningIncidentRepoMock();
    tenantDatabaseService = buildTenantDatabaseServiceMock();
    tenantClient = buildFakeTenantClient();
    tenantContext = buildTenantContextServiceMock(tenantClient);
    saga = new CreateCompanySaga(
      companyRepository,
      membershipRepository,
      provisioningIncidentRepository,
      tenantDatabaseService as unknown as TenantDatabaseService,
      tenantContext as unknown as TenantContextService,
      {} as PrismaMasterService,
    );
    // Step 6 (catalog copy) is proven against real Postgres by
    // `copy-catalog.spec.ts` (Phase 9) — here only the ORCHESTRATION matters
    // (awaited, in the right place, its failure triggers compensation).
    jest.spyOn(saga as unknown as { copyCatalog: jest.Func }, 'copyCatalog').mockResolvedValue(CATALOG_RESULT);
  });

  describe('happy path', () => {
    it('runs all 6 steps and returns an owner + a populated catalog — no follow-up request needed', async () => {
      const result = await saga.run({ name: 'Tienda Nueva', slug: 'tienda-nueva', ownerId: OWNER_ID });

      expect(companyRepository.create).toHaveBeenCalledWith({ name: 'Tienda Nueva', slug: 'tienda-nueva' });
      expect(tenantDatabaseService.createSchema).toHaveBeenCalledWith(SCHEMA_NAME);
      expect(companyRepository.setSchemaName).toHaveBeenCalledWith(COMPANY_ID, SCHEMA_NAME);
      expect(membershipRepository.create).toHaveBeenCalledWith({
        userId: OWNER_ID,
        companyId: COMPANY_ID,
        status: 'ACTIVE',
      });
      expect(tenantContext.run).toHaveBeenCalledWith(
        { companyId: COMPANY_ID, schemaName: SCHEMA_NAME },
        expect.any(Function),
      );
      expect(tenantClient.companyUser.create).toHaveBeenCalledWith({
        data: { id: OWNER_ID, role: USER_ROLES.owner, createdByCompanyUserId: null },
      });

      expect(result).toEqual({
        companyId: COMPANY_ID,
        schemaName: SCHEMA_NAME,
        ownerCompanyUserId: OWNER_ID,
        categoriesCopied: 11,
        productsCopied: 99,
      });

      // Nothing was rolled back and no incident was recorded.
      expect(companyRepository.delete).not.toHaveBeenCalled();
      expect(tenantDatabaseService.deleteSchema).not.toHaveBeenCalled();
      expect(tenantClient.companyUser.delete).not.toHaveBeenCalled();
      expect(membershipRepository.delete).not.toHaveBeenCalled();
      expect(provisioningIncidentRepository.create).not.toHaveBeenCalled();
    });

    it('runs steps in order: Company create before schema create before schemaName set before Membership', async () => {
      const order: string[] = [];
      companyRepository.create.mockImplementation(() => {
        order.push('company-create');
        return Promise.resolve(TEST_COMPANY);
      });
      tenantDatabaseService.createSchema.mockImplementation(() => {
        order.push('schema-create');
        return Promise.resolve();
      });
      companyRepository.setSchemaName.mockImplementation((id, schemaName) => {
        order.push('schema-name-set');
        return Promise.resolve({ ...TEST_COMPANY, id, schemaName });
      });
      membershipRepository.create.mockImplementation(() => {
        order.push('membership-create');
        return Promise.resolve({
          id: MEMBERSHIP_ID,
          userId: OWNER_ID,
          companyId: COMPANY_ID,
          status: 'ACTIVE',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      });

      await saga.run({ name: 'Tienda Nueva', slug: 'tienda-nueva', ownerId: OWNER_ID });

      expect(order).toEqual(['company-create', 'schema-create', 'schema-name-set', 'membership-create']);
    });
  });

  describe('a mid-saga failure rolls back prior steps', () => {
    it('step 4 (Membership creation) failing after steps 1-3 succeeded drops the schema and deletes the Company', async () => {
      const failure = new Error('unique constraint violated');
      membershipRepository.create.mockRejectedValue(failure);

      await expect(
        saga.run({ name: 'Tienda Nueva', slug: 'tienda-nueva', ownerId: OWNER_ID }),
      ).rejects.toBe(failure);

      // Reverse order: step 3's compensation, then step 2's, then step 1's.
      expect(companyRepository.setSchemaName).toHaveBeenCalledWith(COMPANY_ID, null);
      expect(tenantDatabaseService.deleteSchema).toHaveBeenCalledWith(SCHEMA_NAME);
      expect(companyRepository.delete).toHaveBeenCalledWith(COMPANY_ID);

      // Steps 5/6 never ran — nothing tenant-side to compensate.
      expect(tenantClient.companyUser.create).not.toHaveBeenCalled();
      expect(tenantClient.companyUser.delete).not.toHaveBeenCalled();
      expect(membershipRepository.delete).not.toHaveBeenCalled();

      // Every compensation succeeded — no incident.
      expect(provisioningIncidentRepository.create).not.toHaveBeenCalled();
    });

    it('step 6 (catalog copy) failing after steps 1-5 succeeded rolls back the owner CompanyUser, the Membership, the schema, and the Company', async () => {
      const failure = new Error('template read failed');
      jest.spyOn(saga as unknown as { copyCatalog: jest.Func }, 'copyCatalog').mockRejectedValue(failure);

      await expect(
        saga.run({ name: 'Tienda Nueva', slug: 'tienda-nueva', ownerId: OWNER_ID }),
      ).rejects.toBe(failure);

      expect(tenantClient.companyUser.delete).toHaveBeenCalledWith({ where: { id: OWNER_ID } });
      expect(membershipRepository.delete).toHaveBeenCalledWith(MEMBERSHIP_ID);
      expect(companyRepository.setSchemaName).toHaveBeenCalledWith(COMPANY_ID, null);
      expect(tenantDatabaseService.deleteSchema).toHaveBeenCalledWith(SCHEMA_NAME);
      expect(companyRepository.delete).toHaveBeenCalledWith(COMPANY_ID);
      expect(provisioningIncidentRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('a failing compensation step is recorded, not lost', () => {
    it('records a ProvisioningIncident when a compensation step itself fails, and still runs the remaining compensations', async () => {
      const sagaFailure = new Error('template read failed');
      const compensationFailure = new Error('DROP SCHEMA timed out');
      jest.spyOn(saga as unknown as { copyCatalog: jest.Func }, 'copyCatalog').mockRejectedValue(sagaFailure);
      tenantDatabaseService.deleteSchema.mockRejectedValue(compensationFailure);

      // The ORIGINAL saga error surfaces to the caller — not the compensation error.
      await expect(
        saga.run({ name: 'Tienda Nueva', slug: 'tienda-nueva', ownerId: OWNER_ID }),
      ).rejects.toBe(sagaFailure);

      expect(provisioningIncidentRepository.create).toHaveBeenCalledWith({
        companyId: COMPANY_ID,
        step: 'create-schema-rollback',
        reason: compensationFailure.message,
      });

      // The failing compensation does not stop the OTHER compensations from
      // being attempted — reverse order still runs to completion.
      expect(tenantClient.companyUser.delete).toHaveBeenCalledWith({ where: { id: OWNER_ID } });
      expect(membershipRepository.delete).toHaveBeenCalledWith(MEMBERSHIP_ID);
      expect(companyRepository.setSchemaName).toHaveBeenCalledWith(COMPANY_ID, null);
      expect(companyRepository.delete).toHaveBeenCalledWith(COMPANY_ID);
    });

    it('a failing ProvisioningIncident write itself never throws out of the saga — the original error still surfaces', async () => {
      const sagaFailure = new Error('template read failed');
      const compensationFailure = new Error('DROP SCHEMA timed out');
      jest.spyOn(saga as unknown as { copyCatalog: jest.Func }, 'copyCatalog').mockRejectedValue(sagaFailure);
      tenantDatabaseService.deleteSchema.mockRejectedValue(compensationFailure);
      provisioningIncidentRepository.create.mockRejectedValue(new Error('DB unreachable'));

      await expect(
        saga.run({ name: 'Tienda Nueva', slug: 'tienda-nueva', ownerId: OWNER_ID }),
      ).rejects.toBe(sagaFailure);

      // Compensation kept going past the incident-write failure too.
      expect(companyRepository.delete).toHaveBeenCalledWith(COMPANY_ID);
    });
  });
});
