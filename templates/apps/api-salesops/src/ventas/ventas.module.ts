import { Module } from '@nestjs/common';
import { CURRENCY_REPOSITORY, ORDER_REPOSITORY, WAREHOUSE_OPERATOR_REPOSITORY } from '@store-mgmt/domain';
import {
  InfraDbModule,
  PrismaCurrencyRepository,
  PrismaOrderRepository,
  PrismaWarehouseOperatorRepository,
} from '@store-mgmt/infra-db';
import { VentasController } from './ventas.controller.js';
import { VentasService } from './ventas.service.js';

@Module({
  imports: [InfraDbModule],
  controllers: [VentasController],
  providers: [
    VentasService,
    { provide: ORDER_REPOSITORY, useClass: PrismaOrderRepository },
    { provide: CURRENCY_REPOSITORY, useClass: PrismaCurrencyRepository },
    // `VentasController` uses this to enforce the `warehouse_operator` scope (backend-users-roles).
    { provide: WAREHOUSE_OPERATOR_REPOSITORY, useClass: PrismaWarehouseOperatorRepository },
  ],
})
export class VentasModule {}
