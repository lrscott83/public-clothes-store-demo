import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaMasterService } from '@store-mgmt/infra-db';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaMasterService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check(): Promise<{ status: 'ok'; db: 'up' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'up' };
    } catch {
      throw new ServiceUnavailableException({ status: 'error', db: 'down' });
    }
  }
}
