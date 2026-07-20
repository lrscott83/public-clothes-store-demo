import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InfraDbModule } from '@store-mgmt/infra-db';
import { CurrencyModule } from './currency/currency.module.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), InfraDbModule, HealthModule, CurrencyModule],
})
export class AppModule {}
