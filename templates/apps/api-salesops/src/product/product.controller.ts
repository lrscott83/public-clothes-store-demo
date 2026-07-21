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
import { InvalidMoneyError, InvalidProductError } from '@store-mgmt/domain';
import { ProductService } from './product.service.js';
import type {
  CreateProductDto,
  MoneyAmountDto,
  ProductResponseDto,
  UpdateProductDto,
} from './dto/index.js';

const VALID_CURRENCIES = new Set<string>(['USD', 'EUR', 'MN']);

/** Validates a `MoneyAmountDto.currency` — REQUIRED, from the Currency set. */
function assertCurrency(amount: MoneyAmountDto): void {
  if (!VALID_CURRENCIES.has(amount.currency)) {
    throw new BadRequestException(`Unknown currency: "${amount.currency}"`);
  }
}

/**
 * REST delivery for the Product module. Validates `price`/`cost` currency at
 * the boundary (`price`/`cost` MAY differ) and maps `InvalidProductError`
 * (e.g. missing/nonexistent `categoryId`) and `InvalidMoneyError` (malformed
 * decimal string) -> 400. `GET /:id` returns even soft-deleted products
 * (historical references, e.g. past orders); `GET /products` excludes them
 * by default. `DELETE` always soft-deletes — never a hard DELETE.
 */
@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: CreateProductDto): Promise<ProductResponseDto> {
    assertCurrency(body.price);
    assertCurrency(body.cost);
    return this.withDomainErrorMapping(() => this.productService.create(body));
  }

  @Get()
  async list(
    @Query('includeInactive') includeInactive?: string,
    @Query('categoryId') categoryId?: string,
  ): Promise<ProductResponseDto[]> {
    return this.productService.list(includeInactive === 'true', categoryId);
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<ProductResponseDto> {
    const found = await this.productService.findById(id);
    if (!found) {
      throw new NotFoundException(`Product "${id}" not found`);
    }
    return found;
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateProductDto,
  ): Promise<ProductResponseDto> {
    if (body.price !== undefined) {
      assertCurrency(body.price);
    }
    if (body.cost !== undefined) {
      assertCurrency(body.cost);
    }
    return this.withDomainErrorMapping(() => this.productService.update(id, body));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async softDelete(@Param('id') id: string): Promise<{ id: string }> {
    await this.productService.softDelete(id);
    return { id };
  }

  private async withDomainErrorMapping<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof InvalidProductError || err instanceof InvalidMoneyError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }
}
