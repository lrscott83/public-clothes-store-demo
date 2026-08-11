import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller.js';

/**
 * Bare Phase-0 scaffold (spike 0.1a): `GET /health` is a literal
 * `{ status: 'ok' }` with no DB dependency and no tenant resolution. The
 * real, DB-backed `/health` (design.md §3) lands in Phase 4 alongside the
 * rest of `api-public`'s wiring — this file exists only to prove the app
 * boots and responds, ahead of spike 0.1b's Host-header proof.
 */
describe('HealthController', () => {
  it('returns { status: "ok" }', async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    const controller = module.get(HealthController);

    expect(controller.check()).toEqual({ status: 'ok' });
  });
});
