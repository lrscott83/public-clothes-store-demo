import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateProductInput,
  Currency,
  ICategoryRepository,
  IProductRepository,
  Money,
  Product as DomainProduct,
} from '@store-mgmt/domain';
import {
  CATEGORY_REPOSITORY,
  InvalidProductError,
  PRODUCT_REPOSITORY,
  discountPriceFromDecimalString,
  discountPriceToDecimalString,
  finalPrice,
  isOffer,
  moneyFromDecimalString,
  moneyToDecimalString,
  percentFromDecimalString,
  percentToDecimalString,
} from '@store-mgmt/domain';
import type {
  CreateProductDto,
  MoneyAmountDto,
  ProductResponseDto,
  UpdateProductDto,
} from './dto/index.js';

/**
 * Orchestration layer for products: the only place with both I/O (via
 * `PRODUCT_REPOSITORY`/`CATEGORY_REPOSITORY`) and domain pricing logic
 * (`finalPrice`/`isOffer`). Maps decimal-string/`MoneyAmountDto` DTO fields
 * <-> the domain's `Money`/scaled-`bigint` percent/discount, and validates
 * `categoryId` exists before ever calling `productRepository.create` —
 * never a silent 500 or a dangling FK. `price`/`cost` currencies are
 * caller-chosen and MAY DIFFER; the controller validates currency
 * membership before this service is reached.
 */
@Injectable()
export class ProductService {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly productRepository: IProductRepository,
    @Inject(CATEGORY_REPOSITORY) private readonly categoryRepository: ICategoryRepository,
  ) {}

  async create(input: CreateProductDto): Promise<ProductResponseDto> {
    const category = await this.categoryRepository.findById(input.categoryId);
    if (!category) {
      throw new InvalidProductError(`Category "${input.categoryId}" does not exist`);
    }

    const created = await this.productRepository.create(this.toDomainInput(input));
    return this.toResponse(created);
  }

  async update(id: string, patch: UpdateProductDto): Promise<ProductResponseDto> {
    if (patch.categoryId !== undefined) {
      const category = await this.categoryRepository.findById(patch.categoryId);
      if (!category) {
        throw new InvalidProductError(`Category "${patch.categoryId}" does not exist`);
      }
    }

    const updated = await this.productRepository.update(id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.sku !== undefined ? { sku: patch.sku } : {}),
      ...(patch.barcode !== undefined ? { barcode: patch.barcode } : {}),
      ...(patch.price !== undefined ? { price: this.toMoney(patch.price) } : {}),
      ...(patch.percentDiscountPrice !== undefined
        ? { percentDiscountPrice: percentFromDecimalString(patch.percentDiscountPrice) }
        : {}),
      ...(patch.discountPrice !== undefined
        ? { discountPrice: discountPriceFromDecimalString(patch.discountPrice) }
        : {}),
      ...(patch.cost !== undefined ? { cost: this.toMoney(patch.cost) } : {}),
      ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
      ...(patch.image !== undefined ? { image: patch.image } : {}),
      ...(patch.isNew !== undefined ? { isNew: patch.isNew } : {}),
      ...(patch.order !== undefined ? { order: patch.order } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
    });
    return this.toResponse(updated);
  }

  async softDelete(id: string): Promise<void> {
    await this.productRepository.softDelete(id);
  }

  async findById(id: string): Promise<ProductResponseDto | null> {
    const found = await this.productRepository.findById(id);
    return found ? this.toResponse(found) : null;
  }

  async list(includeInactive = false, categoryId?: string): Promise<ProductResponseDto[]> {
    const rows = await this.productRepository.list({ includeInactive, categoryId });
    return rows.map((row) => this.toResponse(row));
  }

  private toMoney(amount: MoneyAmountDto): Money {
    return moneyFromDecimalString(amount.amount, amount.currency as Currency);
  }

  private toMoneyAmountDto(amount: Money): MoneyAmountDto {
    return { amount: moneyToDecimalString(amount), currency: amount.currency };
  }

  private toDomainInput(input: CreateProductDto): CreateProductInput {
    return {
      name: input.name,
      description: input.description,
      sku: input.sku,
      barcode: input.barcode,
      price: this.toMoney(input.price),
      percentDiscountPrice: input.percentDiscountPrice
        ? percentFromDecimalString(input.percentDiscountPrice)
        : undefined,
      discountPrice: input.discountPrice
        ? discountPriceFromDecimalString(input.discountPrice)
        : undefined,
      cost: this.toMoney(input.cost),
      categoryId: input.categoryId,
      image: input.image,
      isNew: input.isNew,
      order: input.order,
      active: input.active,
    };
  }

  private toResponse(product: DomainProduct): ProductResponseDto {
    return {
      id: product.id,
      name: product.name,
      description: product.description,
      sku: product.sku ?? null,
      barcode: product.barcode ?? null,
      price: this.toMoneyAmountDto(product.price),
      percentDiscountPrice: percentToDecimalString(product.percentDiscountPrice),
      discountPrice: discountPriceToDecimalString(product.discountPrice),
      cost: this.toMoneyAmountDto(product.cost),
      finalPrice: this.toMoneyAmountDto(finalPrice(product)),
      isOffer: isOffer(product),
      categoryId: product.categoryId,
      image: product.image,
      isNew: product.isNew,
      order: product.order,
      active: product.active,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }
}
