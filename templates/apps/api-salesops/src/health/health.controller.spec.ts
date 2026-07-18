import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@store-mgmt/infra-db';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('returns 503 { status: "error", db: "down" } when the DB query rejects', async () => {
    const prismaMock = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('connection refused')),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prismaMock }],
    }).compile();

    const controller = module.get(HealthController);

    await expect(controller.check()).rejects.toMatchObject({
      status: 503,
      response: { status: 'error', db: 'down' },
    });
  });
});
