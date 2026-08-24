import { Controller } from '@nestjs/common';
import { PlatformService } from './platform.service.js';

/**
 * Platform superadmin endpoints (design D1/D2/D3) — routes and guard wiring
 * land with task 2.4's TDD cycle (`platform.controller.spec.ts`).
 */
@Controller('platform')
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}
}
