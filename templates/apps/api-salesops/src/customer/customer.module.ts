import { Module } from '@nestjs/common';
import { CUSTOMER_REPOSITORY } from '@store-mgmt/domain';
import { InfraDbModule, PrismaCustomerRepository } from '@store-mgmt/infra-db';
import { CustomerController } from './customer.controller.js';
import { CustomerService } from './customer.service.js';

@Module({
  imports: [InfraDbModule],
  controllers: [CustomerController],
  providers: [
    CustomerService,
    { provide: CUSTOMER_REPOSITORY, useClass: PrismaCustomerRepository },
  ],
})
export class CustomerModule {}
