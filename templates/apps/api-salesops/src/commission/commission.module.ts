import { Module } from '@nestjs/common';
import {
  COMMISSION_ACCRUAL_RECORDER,
  COMMISSION_ACCRUAL_REPOSITORY,
  COMMISSION_PAYMENT_REPOSITORY,
  COMMISSION_REFERENCE_PROVIDER,
} from '@store-mgmt/domain';
import {
  InfraDbModule,
  PrismaCommissionAccrualRepository,
  PrismaCommissionPaymentRepository,
  PrismaCommissionReferenceProvider,
} from '@store-mgmt/infra-db';
import { CommissionAccrualRecorder } from './commission-accrual.recorder.js';
import { CommissionController } from './commission.controller.js';
import { CommissionService } from './commission.service.js';

/**
 * Exports `COMMISSION_ACCRUAL_RECORDER` so `SalesModule` can inject it into
 * `OrderService.deliver`. That export is the ONLY thing sales sees of this
 * module — it depends on the port, not on anything in here.
 */
@Module({
  imports: [InfraDbModule],
  controllers: [CommissionController],
  providers: [
    CommissionService,
    { provide: COMMISSION_REFERENCE_PROVIDER, useClass: PrismaCommissionReferenceProvider },
    { provide: COMMISSION_ACCRUAL_REPOSITORY, useClass: PrismaCommissionAccrualRepository },
    { provide: COMMISSION_PAYMENT_REPOSITORY, useClass: PrismaCommissionPaymentRepository },
    { provide: COMMISSION_ACCRUAL_RECORDER, useClass: CommissionAccrualRecorder },
  ],
  exports: [COMMISSION_ACCRUAL_RECORDER],
})
export class CommissionModule {}
