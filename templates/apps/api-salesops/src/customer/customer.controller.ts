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
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, Roles, RolesGuard } from '@store-mgmt/api-common';
import {
  CustomerUserNotFoundError,
  DuplicateCustomerDocumentError,
  DuplicateCustomerUserError,
  InvalidCustomerError,
  USER_ROLES,
} from '@store-mgmt/domain';
import { CustomerService } from './customer.service.js';
import type { CreateCustomerDto, CustomerResponseDto, UpdateCustomerDto } from './dto/index.js';

/**
 * REST delivery for the Customer module. Maps `InvalidCustomerError` -> 400
 * (e.g. empty fullName/userId), `CustomerUserNotFoundError` -> 400 (the
 * given `userId` does not reference an existing `User`), and both
 * `DuplicateCustomerDocumentError`/`DuplicateCustomerUserError` -> 409
 * (backend-users-roles: `userId` is a required, unique 1:1 link). `DELETE`
 * always soft-deletes (`active=false`) — never a hard DELETE. Mirrors
 * `WarehouseController`. Every route is `owner`/`admin`/`sales_operator`-only
 * (backend-users-roles permission matrix) — customer master data is
 * cockpit-internal, never exposed to a plain `user`.
 *
 * `sales_agent` is added to the two READ routes ONLY, per method. An agent
 * books orders for customers, so it must be able to find one — but `POST`
 * here accepts an arbitrary existing `userId`, so granting it would let an
 * agent bind a customer record to ANY identity, the owner's included. The
 * agent's own creation path is a separate endpoint that mints the identity
 * itself and never honours a caller-supplied `userId`.
 */
@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(USER_ROLES.owner, USER_ROLES.admin, USER_ROLES.sales_operator)
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: CreateCustomerDto): Promise<CustomerResponseDto> {
    return this.withDomainErrorMapping(() => this.customerService.create(body));
  }

  @Get()
  @Roles(USER_ROLES.owner, USER_ROLES.admin, USER_ROLES.sales_operator, USER_ROLES.sales_agent)
  async list(@Query('includeInactive') includeInactive?: string): Promise<CustomerResponseDto[]> {
    return this.customerService.list(includeInactive === 'true');
  }

  @Get(':id')
  @Roles(USER_ROLES.owner, USER_ROLES.admin, USER_ROLES.sales_operator, USER_ROLES.sales_agent)
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
      if (err instanceof CustomerUserNotFoundError) {
        throw new BadRequestException(err.message);
      }
      if (err instanceof DuplicateCustomerDocumentError) {
        throw new ConflictException(err.message);
      }
      if (err instanceof DuplicateCustomerUserError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }
}
