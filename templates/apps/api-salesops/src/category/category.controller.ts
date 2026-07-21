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
} from '@nestjs/common';
import { InvalidCategoryError } from '@store-mgmt/domain';
import { CategoryService } from './category.service.js';
import type { CategoryResponseDto, CreateCategoryDto, UpdateCategoryDto } from './dto/index.js';

/**
 * REST delivery for the Category module. Maps `InvalidCategoryError` -> 400
 * (e.g. duplicate slug) and a not-found lookup -> 404. `DELETE` always
 * soft-deletes (`active=false`) — never a hard DELETE.
 */
@Controller('categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: CreateCategoryDto): Promise<CategoryResponseDto> {
    return this.withDomainErrorMapping(() => this.categoryService.create(body));
  }

  @Get()
  async list(@Query('includeInactive') includeInactive?: string): Promise<CategoryResponseDto[]> {
    return this.categoryService.list(includeInactive === 'true');
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<CategoryResponseDto> {
    const found = await this.categoryService.findById(id);
    if (!found) {
      throw new NotFoundException(`Category "${id}" not found`);
    }
    return found;
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    return this.withDomainErrorMapping(() => this.categoryService.update(id, body));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async softDelete(@Param('id') id: string): Promise<{ id: string }> {
    await this.categoryService.softDelete(id);
    return { id };
  }

  private async withDomainErrorMapping<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof InvalidCategoryError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }
}
