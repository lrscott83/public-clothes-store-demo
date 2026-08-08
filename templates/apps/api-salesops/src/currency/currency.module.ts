import { Module } from '@nestjs/common';
import { CURRENCY_REPOSITORY } from '@store-mgmt/domain';
import { InfraDbModule, PrismaCurrencyRepository } from '@store-mgmt/infra-db';
import { CurrencyController } from './currency.controller.js';
import { CurrencyService } from './currency.service.js';

@Module({
  imports: [InfraDbModule],
  controllers: [CurrencyController],
  providers: [
    CurrencyService,
    { provide: CURRENCY_REPOSITORY, useClass: PrismaCurrencyRepository },
  ],
})
export class CurrencyModule {}
