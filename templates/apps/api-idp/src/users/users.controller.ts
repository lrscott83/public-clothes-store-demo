import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, Roles, RolesGuard } from '@store-mgmt/api-common';
import { USER_ROLES } from '@store-mgmt/domain';
import type { UserResponseDto } from '../auth/dto/user-response.dto.js';
import type { CreateUserDto, UpdateUserDto } from './dto/index.js';
import { UsersService } from './users.service.js';

/**
 * Admin/owner-only user administration (design.md §6/locked matrix: `admin`
 * is system super-root, `owner` manages its own business's users).
 * `@UseGuards(JwtAuthGuard, RolesGuard)` order matters: an unauthenticated
 * request is rejected 401 by `JwtAuthGuard` BEFORE `RolesGuard` ever runs.
 */
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(USER_ROLES.admin, USER_ROLES.owner)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.create(body);
  }

  @Get()
  async list(): Promise<UserResponseDto[]> {
    return this.usersService.list();
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<UserResponseDto> {
    return this.usersService.findById(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: UpdateUserDto): Promise<UserResponseDto> {
    return this.usersService.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deactivate(@Param('id') id: string): Promise<UserResponseDto> {
    return this.usersService.deactivate(id);
  }
}
