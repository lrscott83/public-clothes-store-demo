import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Controller, Get, Module, UseGuards } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { COMPANY_REPOSITORY, type Company } from '@store-mgmt/domain';
import request from 'supertest';
import { PublicTenantGuard } from './public-tenant.guard.js';

type CompanyRepositoryMock = { findBySlug: jest.Mock };

const ACTIVE_COMPANY: Company = {
  id: 'company-uuid-1',
  name: 'Tienda Prueba',
  slug: 'acme',
  isActive: true,
  schemaName: 'store_mgmt_tenant_company_uuid_1',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

/** A bare controller guarded ONLY by `PublicTenantGuard` — proves the guard's own contract without any real product/category route. */
@Controller('probe')
@UseGuards(PublicTenantGuard)
class ProbeController {
  @Get()
  get(): { ok: true } {
    return { ok: true };
  }
}

@Module({
  controllers: [ProbeController],
  providers: [PublicTenantGuard, { provide: COMPANY_REPOSITORY, useValue: {} }],
})
class ProbeModule {}

async function buildApp(companyRepository: CompanyRepositoryMock): Promise<INestApplication> {
  const module: TestingModule = await Test.createTestingModule({
    imports: [ProbeModule],
  })
    .overrideProvider(COMPANY_REPOSITORY)
    .useValue(companyRepository)
    .compile();
  const app = module.createNestApplication();
  await app.init();
  return app;
}

describe('PublicTenantGuard', () => {
  let companyRepository: CompanyRepositoryMock;
  let app: INestApplication;

  beforeEach(() => {
    companyRepository = { findBySlug: jest.fn() };
  });

  afterEach(async () => {
    await app?.close();
  });

  it('resolves an active, provisioned company and opens the request for the handler', async () => {
    companyRepository.findBySlug.mockResolvedValue(ACTIVE_COMPANY);
    app = await buildApp(companyRepository);

    const response = await request(app.getHttpServer()).get('/probe').set('Host', 'acme.localhost');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(companyRepository.findBySlug).toHaveBeenCalledWith('acme');
  });

  it('never requires req.user to be set — proves it runs with no prior auth guard (design D2/D3)', async () => {
    companyRepository.findBySlug.mockResolvedValue(ACTIVE_COMPANY);
    app = await buildApp(companyRepository);

    // No Authorization header anywhere in this file's requests. The guard
    // succeeding here (200, not 401/403) IS the proof: it never reads
    // `req.user`. Compiling `ProbeModule` at all is a second proof — its
    // provider list has no `MEMBERSHIP_REPOSITORY`, `JWT_CONFIG`, or
    // `PassportModule`; if `PublicTenantGuard` depended on any of the
    // authenticated chain (JwtAuthGuard, TenantContextGuard's Membership
    // branch, RolesGuard), `Test.createTestingModule(...).compile()` above
    // would have thrown a "can't resolve dependencies" error before this
    // assertion ever ran.
    const response = await request(app.getHttpServer()).get('/probe').set('Host', 'acme.localhost');
    expect(response.status).toBe(200);
  });

  it('does not import anything from @store-mgmt/api-common (design D3 — dependency hygiene, not DRY)', () => {
    const source = readFileSync(join(__dirname, 'public-tenant.guard.ts'), 'utf8');
    expect(source).not.toContain('@store-mgmt/api-common');
  });

  it('an unknown slug returns 404', async () => {
    companyRepository.findBySlug.mockResolvedValue(null);
    app = await buildApp(companyRepository);

    const response = await request(app.getHttpServer()).get('/probe').set('Host', 'unknown.localhost');
    expect(response.status).toBe(404);
  });

  it('an inactive company returns 404', async () => {
    companyRepository.findBySlug.mockResolvedValue({ ...ACTIVE_COMPANY, isActive: false });
    app = await buildApp(companyRepository);

    const response = await request(app.getHttpServer()).get('/probe').set('Host', 'acme.localhost');
    expect(response.status).toBe(404);
  });

  it('a company with schemaName: null returns 404', async () => {
    companyRepository.findBySlug.mockResolvedValue({ ...ACTIVE_COMPANY, schemaName: null });
    app = await buildApp(companyRepository);

    const response = await request(app.getHttpServer()).get('/probe').set('Host', 'acme.localhost');
    expect(response.status).toBe(404);
  });

  it('a malformed host (single label) returns 404, never a 400', async () => {
    app = await buildApp(companyRepository);

    const response = await request(app.getHttpServer()).get('/probe').set('Host', 'localhost');
    expect(response.status).toBe(404);
    expect(companyRepository.findBySlug).not.toHaveBeenCalled();
  });

  it('the three 404 causes (unknown slug, inactive company, null schemaName) are byte-identical responses — same status, same body, same headers', async () => {
    const scenarios: Array<{ label: string; company: Company | null; host: string }> = [
      { label: 'unknown slug', company: null, host: 'ghost.localhost' },
      { label: 'inactive company', company: { ...ACTIVE_COMPANY, isActive: false }, host: 'acme.localhost' },
      { label: 'null schemaName', company: { ...ACTIVE_COMPANY, schemaName: null }, host: 'acme.localhost' },
    ];

    const responses = [];
    for (const scenario of scenarios) {
      companyRepository.findBySlug.mockResolvedValue(scenario.company);
      const scenarioApp = await buildApp(companyRepository);
      const response = await request(scenarioApp.getHttpServer())
        .get('/probe')
        .set('Host', scenario.host);
      responses.push(response);
      await scenarioApp.close();
    }

    const [unknownRes, inactiveRes, noSchemaRes] = responses;

    // Status: identical across all three.
    expect(unknownRes.status).toBe(404);
    expect(inactiveRes.status).toBe(404);
    expect(noSchemaRes.status).toBe(404);

    // Body: byte-identical JSON — not merely "both 404", the exact same
    // shape and content (design D4).
    expect(inactiveRes.body).toEqual(unknownRes.body);
    expect(noSchemaRes.body).toEqual(unknownRes.body);

    // Headers relevant to content shape (excluding the `Date` header, which
    // varies by wall-clock time and carries no diagnostic signal).
    const stableHeaders = (res: request.Response): Record<string, unknown> => {
      const headers: Record<string, unknown> = { ...res.headers };
      delete headers.date;
      return headers;
    };
    expect(stableHeaders(inactiveRes)).toEqual(stableHeaders(unknownRes));
    expect(stableHeaders(noSchemaRes)).toEqual(stableHeaders(unknownRes));
  });
});
