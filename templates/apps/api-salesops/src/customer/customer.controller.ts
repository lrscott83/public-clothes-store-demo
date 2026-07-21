import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { DuplicateCustomerDocumentError, InvalidCustomerError } from '@store-mgmt/domain';
import { CustomerService } from './customer.service.js';
import type { CreateCustomerDto, CustomerResponseDto, UpdateCustomerDto } from './dto/index.js';

/**
 * REST delivery for the Customer module. Maps `InvalidCustomerError` -> 400
 * (e.g. empty fullName) and `DuplicateCustomerDocumentError` -> 409. `DELETE`
 * always soft-deletes (`active=false`) — never a hard DELETE. Mirrors
 * `WarehouseController`.
 */
@Controller('customers')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: CreateCustomerDto): Promise<CustomerResponseDto> {
    return this.withDomainErrorMapping(() => this.customerService.create(body));
  }

  @Get()
  async list(@Query('includeInactive') includeInactive?: string): Promise<CustomerResponseDto[]> {
    return this.customerService.list(includeInactive === 'true');
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<CustomerResponseDto> {
    const found = await this.customerService.findById(id);
    if (!found) {
      throw new NotFoundException(`Customer "${id}" not found`);
    }
    return found;
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateCustomerDto,
  ): Promise<CustomerResponseDto> {
    return this.withDomainErrorMapping(() => this.customerService.update(id, body));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async softDelete(@Param('id') id: string): Promise<{ id: string }> {
    await this.customerService.softDelete(id);
    return { id };
  }

  private async withDomainErrorMapping<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof InvalidCustomerError) {
        throw new BadRequestException(err.message);
      }
      if (err instanceof DuplicateCustomerDocumentError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }
}
