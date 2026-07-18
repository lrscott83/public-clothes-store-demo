import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InfraDbModule } from '@store-mgmt/infra-db';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), InfraDbModule, HealthModule],
})
export class AppModule {}
