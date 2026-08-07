import { Module } from '@nestjs/common';
import { CARRIER_REPOSITORY, CARRIER_WAREHOUSE_REPOSITORY, DELIVERY_ASSIGNMENT_REPOSITORY } from '@store-mgmt/domain';
import {
  InfraDbModule,
  PrismaCarrierRepository,
  PrismaCarrierWarehouseRepository,
  PrismaDeliveryAssignmentRepository,
} from '@store-mgmt/infra-db';
import { SalesModule } from '../sales/sales.module.js';
import { CarrierController } from './carrier.controller.js';
import { DeliveryAssignmentController } from './delivery-assignment.controller.js';
import { DeliveryService } from './delivery.service.js';

/**
 * Phase 6a shipped Carrier CRUD writes + `assign` on `InfraDbModule` alone.
 * Phase 6b (this) adds `markDelivered`, which needs `IOrderDeliveryGateway`
 * — so `SalesModule` is imported here for the FIRST time (design §2A).
 * `SalesModule` exports only `ORDER_DELIVERY_GATEWAY`; this module gains the
 * delivery→sales trigger without gaining any knowledge of `OrderService`,
 * `IOrderRepository`, or anything else Sales owns. The reverse import
 * (`apps/api-salesops/src/sales/**` -> `../delivery/**`) is what stays
 * forbidden — see `packages/eslint-config/backend-boundaries.config.js`'s
 * `salesForbidsDeliveryImportRule`.
 */
@Module({
  imports: [InfraDbModule, SalesModule],
  controllers: [CarrierController, DeliveryAssignmentController],
  providers: [
    DeliveryService,
    { provide: CARRIER_REPOSITORY, useClass: PrismaCarrierRepository },
    { provide: CARRIER_WAREHOUSE_REPOSITORY, useClass: PrismaCarrierWarehouseRepository },
    { provide: DELIVERY_ASSIGNMENT_REPOSITORY, useClass: PrismaDeliveryAssignmentRepository },
  ],
})
export class DeliveryModule {}
