import { Module } from '@nestjs/common';
import {
  CATEGORY_REPOSITORY,
  CURRENCY_REPOSITORY,
  CUSTOMER_REPOSITORY,
  ORDER_REPOSITORY,
  PRODUCT_REPOSITORY,
  STOCK_LEVEL_REPOSITORY,
  WAREHOUSE_OPERATOR_REPOSITORY,
  WAREHOUSE_REPOSITORY,
} from '@store-mgmt/domain';
import {
  InfraDbModule,
  PrismaCategoryRepository,
  PrismaCurrencyRepository,
  PrismaCustomerRepository,
  PrismaProductRepository,
  PrismaOrderRepository,
  PrismaStockLevelRepository,
  PrismaWarehouseOperatorRepository,
  PrismaWarehouseRepository,
} from '@store-mgmt/infra-db';
import { AvailabilityController } from './availability.controller.js';
import { AvailabilityService } from './availability.service.js';
import { OrderController } from './order.controller.js';
import { OrderService } from './order.service.js';

@Module({
  imports: [InfraDbModule],
  controllers: [OrderController, AvailabilityController],
  providers: [
    OrderService,
    AvailabilityService,
    { provide: ORDER_REPOSITORY, useClass: PrismaOrderRepository },
    { provide: CURRENCY_REPOSITORY, useClass: PrismaCurrencyRepository },
    // `OrderController` uses this to enforce the `warehouse_operator` scope (backend-users-roles).
    { provide: WAREHOUSE_OPERATOR_REPOSITORY, useClass: PrismaWarehouseOperatorRepository },
    // Availability reads. Bound by PORT SYMBOL, never the concrete Prisma class —
    // Sales reaches Inventory only through the composition layer.
    { provide: STOCK_LEVEL_REPOSITORY, useClass: PrismaStockLevelRepository },
    { provide: WAREHOUSE_REPOSITORY, useClass: PrismaWarehouseRepository },
    // Catalog + customer resolution: every field of an order line that reaches
    // money is read from here, never from the request body.
    { provide: PRODUCT_REPOSITORY, useClass: PrismaProductRepository },
    { provide: CATEGORY_REPOSITORY, useClass: PrismaCategoryRepository },
    { provide: CUSTOMER_REPOSITORY, useClass: PrismaCustomerRepository },
  ],
})
export class SalesModule {}
