import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RolesGuard } from '@store-mgmt/api-common';
import {
  InvalidStockMovementError,
  NegativeStockError,
  USER_ROLES,
  WAREHOUSE_OPERATOR_REPOSITORY,
  type IWarehouseOperatorRepository,
} from '@store-mgmt/domain';
import { TenantContextService } from '@store-mgmt/infra-db';
import request from 'supertest';
import {
  mockTenantContextService,
  overrideJwtAuth,
  overrideTenantContext,
} from '../test-support/auth-test-helpers.js';
import { StockController } from './stock.controller.js';
import { StockService } from './stock.service.js';

type StockServiceMock = {
  getLevel: jest.Mock;
  recordMovement: jest.Mock;
};

const OWN_WAREHOUSE_ID = 'warehouse-uuid-1';
const OTHER_WAREHOUSE_ID = 'warehouse-uuid-2';

const sampleLevelResponse = {
  productId: 'product-uuid-1',
  warehouseId: 'warehouse-uuid-1',
  onHand: '10',
  reserved: '3',
  available: '7',
};

const sampleMovementResponse = {
  id: 'movement-uuid-1',
  productId: 'product-uuid-1',
  warehouseId: 'warehouse-uuid-1',
  type: 'purchase_in',
  reason: null,
  quantity: '10',
  createdAt: '2026-01-01T00:00:00.000Z',
  createdBy: null,
  stockLevel: { ...sampleLevelResponse, onHand: '20', available: '17' },
};

/** Builds a test app with `JwtAuthGuard` overridden to inject `req.user` with `roles` (`null` -> 401), keeping the REAL `RolesGuard`. `warehouseOperatorRepository.findByUserId` defaults to a row scoped to `OWN_WAREHOUSE_ID`. */
async function buildApp(
  service: StockServiceMock,
  roles: number | null,
  warehouseOperatorRepository: jest.Mocked<IWarehouseOperatorRepository> = buildOperatorRepoMock(),
): Promise<INestApplication> {
  const builder = overrideTenantContext(
    overrideJwtAuth(
      Test.createTestingModule({
        controllers: [StockController],
        providers: [
          { provide: StockService, useValue: service },
          { provide: WAREHOUSE_OPERATOR_REPOSITORY, useValue: warehouseOperatorRepository },
          { provide: TenantContextService, useValue: mockTenantContextService() },
          RolesGuard,
        ],
      }),
      roles,
    ),
  );
  const module: TestingModule = await builder.compile();
  const app = module.createNestApplication();
  await app.init();
  return app;
}

function buildOperatorRepoMock(): jest.Mocked<IWarehouseOperatorRepository> {
  return {
    create: jest.fn(),
    findByUserId: jest.fn().mockResolvedValue({
      companyUserId: 'test-user-1',
      warehouseId: OWN_WAREHOUSE_ID,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }),
    findByWarehouseId: jest.fn(),
  };
}

describe('StockController', () => {
  let app: INestApplication;
  let service: StockServiceMock;

  beforeEach(async () => {
    service = {
      getLevel: jest.fn(),
      recordMovement: jest.fn(),
    };

    // `admin` passes every role gate AND bypasses warehouse scoping — keeps
    // pre-existing tests focused on behavior, not on the role/scope matrix
    // (that's covered below).
    app = await buildApp(service, USER_ROLES.admin);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /stock', () => {
    it('returns 200 with string available', async () => {
      service.getLevel.mockResolvedValue(sampleLevelResponse);

      const response = await request(app.getHttpServer()).get(
        '/stock?productId=product-uuid-1&warehouseId=warehouse-uuid-1',
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual(sampleLevelResponse);
      expect(service.getLevel).toHaveBeenCalledWith('product-uuid-1', 'warehouse-uuid-1');
    });
  });

  describe('POST /stock/movements', () => {
    it('returns 201 with the movement + resulting level', async () => {
      service.recordMovement.mockResolvedValue(sampleMovementResponse);

      const response = await request(app.getHttpServer()).post('/stock/movements').send({
        productId: 'product-uuid-1',
        warehouseId: 'warehouse-uuid-1',
        type: 'purchase_in',
        quantity: '10',
      });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(sampleMovementResponse);
    });

    it('rejects an unknown movement type with 400 — never a silent 500', async () => {
      const response = await request(app.getHttpServer()).post('/stock/movements').send({
        productId: 'product-uuid-1',
        warehouseId: 'warehouse-uuid-1',
        type: 'not-a-real-type',
        quantity: '10',
      });

      expect(response.status).toBe(400);
      expect(service.recordMovement).not.toHaveBeenCalled();
    });

    it('maps an unknown-product InvalidStockMovementError to 400', async () => {
      service.recordMovement.mockRejectedValue(
        new InvalidStockMovementError('Product "unknown" does not exist'),
      );

      const response = await request(app.getHttpServer()).post('/stock/movements').send({
        productId: 'unknown',
        warehouseId: 'warehouse-uuid-1',
        type: 'purchase_in',
        quantity: '10',
      });

      expect(response.status).toBe(400);
    });

    it('maps a NegativeStockError to 400', async () => {
      service.recordMovement.mockRejectedValue(
        new NegativeStockError('Movement sale_out of 10 would drive onHand negative (have 5)'),
      );

      const response = await request(app.getHttpServer()).post('/stock/movements').send({
        productId: 'product-uuid-1',
        warehouseId: 'warehouse-uuid-1',
        type: 'sale_out',
        quantity: '10',
      });

      expect(response.status).toBe(400);
    });

    it('rejects a non-positive quantity with 400 via a mapped InvalidStockMovementError', async () => {
      service.recordMovement.mockRejectedValue(
        new InvalidStockMovementError('StockMovement quantity must be a positive integer (got 0)'),
      );

      const response = await request(app.getHttpServer()).post('/stock/movements').send({
        productId: 'product-uuid-1',
        warehouseId: 'warehouse-uuid-1',
        type: 'purchase_in',
        quantity: '0',
      });

      expect(response.status).toBe(400);
    });
  });

  describe('RolesGuard enforcement + warehouse-operator scope (owner/admin/warehouse_operator only)', () => {
    it('rejects an unauthenticated request with 401', async () => {
      await app.close();
      app = await buildApp(service, null);

      const response = await request(app.getHttpServer()).get(
        '/stock?productId=product-uuid-1&warehouseId=warehouse-uuid-1',
      );
      expect(response.status).toBe(401);
    });

    it('rejects a "sales_operator" caller with 403 — not a stock role', async () => {
      await app.close();
      app = await buildApp(service, USER_ROLES.sales_operator);

      const response = await request(app.getHttpServer()).get(
        '/stock?productId=product-uuid-1&warehouseId=warehouse-uuid-1',
      );
      expect(response.status).toBe(403);
    });

    it('admits a "warehouse_operator" reading THEIR OWN warehouse -> 200', async () => {
      await app.close();
      service.getLevel.mockResolvedValue(sampleLevelResponse);
      app = await buildApp(service, USER_ROLES.warehouse_operator);

      const response = await request(app.getHttpServer()).get(
        `/stock?productId=product-uuid-1&warehouseId=${OWN_WAREHOUSE_ID}`,
      );
      expect(response.status).toBe(200);
    });

    it('rejects a "warehouse_operator" reading ANOTHER warehouse with 403', async () => {
      await app.close();
      app = await buildApp(service, USER_ROLES.warehouse_operator);

      const response = await request(app.getHttpServer()).get(
        `/stock?productId=product-uuid-1&warehouseId=${OTHER_WAREHOUSE_ID}`,
      );
      expect(response.status).toBe(403);
      expect(service.getLevel).not.toHaveBeenCalled();
    });

    it('rejects a "warehouse_operator" recording a movement in ANOTHER warehouse with 403', async () => {
      await app.close();
      app = await buildApp(service, USER_ROLES.warehouse_operator);

      const response = await request(app.getHttpServer()).post('/stock/movements').send({
        productId: 'product-uuid-1',
        warehouseId: OTHER_WAREHOUSE_ID,
        type: 'purchase_in',
        quantity: '10',
      });
      expect(response.status).toBe(403);
      expect(service.recordMovement).not.toHaveBeenCalled();
    });

    it('an "owner" caller is NEVER scoped — reads any warehouse -> 200', async () => {
      await app.close();
      service.getLevel.mockResolvedValue(sampleLevelResponse);
      const operatorRepo = buildOperatorRepoMock();
      app = await buildApp(service, USER_ROLES.owner, operatorRepo);

      const response = await request(app.getHttpServer()).get(
        `/stock?productId=product-uuid-1&warehouseId=${OTHER_WAREHOUSE_ID}`,
      );
      expect(response.status).toBe(200);
      expect(operatorRepo.findByUserId).not.toHaveBeenCalled();
    });
  });
});
