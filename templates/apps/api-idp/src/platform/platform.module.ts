import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller.js';
import { PlatformService } from './platform.service.js';

/**
 * Platform superadmin surface (design D1/D2/D3) — superadmin-gated company
 * list + create-on-behalf endpoints. Lives OUTSIDE every tenant: no
 * `TenantContextGuard`/`RolesGuard` anywhere in its chain.
 */
@Module({
  controllers: [PlatformController],
  providers: [PlatformService],
})
export class PlatformModule {}
