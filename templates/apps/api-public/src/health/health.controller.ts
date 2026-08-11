import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';

/**
 * Bare Phase-0 scaffold (spike 0.1a). No tenant resolution, no DB
 * dependency — proves the app boots and the dev server accepts requests
 * with an arbitrary `Host` header (spike 0.1b). The real `/health`
 * (design.md §3, still no tenant resolution, but wired with the rest of the
 * app) lands in Phase 4.
 */
@Controller('health')
export class HealthController {
  @Get()
  @HttpCode(HttpStatus.OK)
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
