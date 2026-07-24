import {
  BadRequestException,
  Body,
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
import { InvalidWarehouseError, USER_ROLES } from '@store-mgmt/domain';
import { WarehouseService } from './warehouse.service.js';
import type { CreateWarehouseDto, UpdateWarehouseDto, WarehouseResponseDto } from './dto/index.js';

/**
 * REST delivery for the Warehouse module. Maps `InvalidWarehouseError` -> 400
 * (e.g. empty name). `DELETE` always soft-deletes (`active=false`) — never a
 * hard DELETE. Mirrors `CategoryController`. Reads are open to any
 * authenticated user; writes are `owner`/`admin`-only (backend-users-roles
 * permission matrix).
 */
@Controller('warehouses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(USER_ROLES.owner, USER_ROLES.admin)
  async create(@Body() body: CreateWarehouseDto): Promise<WarehouseResponseDto> {
    return this.withDomainErrorMapping(() => this.warehouseService.create(body));
  }

  @Get()
  async list(@Query('includeInactive') includeInactive?: string): Promise<WarehouseResponseDto[]> {
    return this.warehouseService.list(includeInactive === 'true');
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<WarehouseResponseDto> {
    const found = await this.warehouseService.findById(id);
    if (!found) {
      throw new NotFoundException(`Warehouse "${id}" not found`);
    }
    return found;
  }

  @Patch(':id')
  @Roles(USER_ROLES.owner, USER_ROLES.admin)
  async update(
    @Param('id') id: string,
    @Body() body: UpdateWarehouseDto,
  ): Promise<WarehouseResponseDto> {
    return this.withDomainErrorMapping(() => this.warehouseService.update(id, body));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles(USER_ROLES.owner, USER_ROLES.admin)
  async softDelete(@Param('id') id: string): Promise<{ id: string }> {
    await this.warehouseService.softDelete(id);
    return { id };
  }

  private async withDomainErrorMapping<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof InvalidWarehouseError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }
}
