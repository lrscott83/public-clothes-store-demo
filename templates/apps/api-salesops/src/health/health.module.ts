import { Module } from '@nestjs/common';
import { InfraDbModule } from '@store-mgmt/infra-db';
import { HealthController } from './health.controller.js';

@Module({
  imports: [InfraDbModule],
  controllers: [HealthController],
})
export class HealthModule {}
