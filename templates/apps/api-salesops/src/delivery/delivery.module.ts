import { Module } from '@nestjs/common';
import { CARRIER_REPOSITORY, CARRIER_WAREHOUSE_REPOSITORY, DELIVERY_ASSIGNMENT_REPOSITORY } from '@store-mgmt/domain';
import {
  InfraDbModule,
  PrismaCarrierRepository,
  PrismaCarrierWarehouseRepository,
  PrismaDeliveryAssignmentRepository,
} from '@store-mgmt/infra-db';
import { CarrierController } from './carrier.controller.js';
import { DeliveryAssignmentController } from './delivery-assignment.controller.js';
import { DeliveryService } from './delivery.service.js';

/**
 * Phase 4 (Slice B2): READS ONLY. Imports ONLY `InfraDbModule` — `SalesModule`
 * is deliberately NOT imported here yet. That import arrives in Phase 6
 * alongside `markDelivered`'s gateway call (design §2A); adding it early
 * would be scope leaking ahead of the write path that actually needs it.
 */
@Module({
  imports: [InfraDbModule],
  controllers: [CarrierController, DeliveryAssignmentController],
  providers: [
    DeliveryService,
    { provide: CARRIER_REPOSITORY, useClass: PrismaCarrierRepository },
    { provide: CARRIER_WAREHOUSE_REPOSITORY, useClass: PrismaCarrierWarehouseRepository },
    { provide: DELIVERY_ASSIGNMENT_REPOSITORY, useClass: PrismaDeliveryAssignmentRepository },
  ],
})
export class DeliveryModule {}
