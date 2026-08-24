import { Module } from '@nestjs/common';

/**
 * Platform superadmin surface (design D1/D2/D3) — superadmin-gated company
 * list + create-on-behalf endpoints. Lives OUTSIDE every tenant: no
 * `TenantContextGuard`/`RolesGuard` anywhere in its chain. Controller and
 * service land with their own TDD cycles (`platform.service.ts`,
 * `platform.controller.ts`) and register here as they are built.
 */
@Module({})
export class PlatformModule {}
