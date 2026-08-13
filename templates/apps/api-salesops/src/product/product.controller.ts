import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  MaxFileSizeValidator,
  NotFoundException,
  Param,
  ParseFilePipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard, Roles, RolesGuard, TenantContextGuard, createRunInTenant } from '@store-mgmt/api-common';
import {
  IMAGE_STORE,
  InvalidMoneyError,
  InvalidProductError,
  isUploadMintedRef,
  USER_ROLES,
  type IImageStore,
} from '@store-mgmt/domain';
import { TenantContextService, type TenantContext } from '@store-mgmt/infra-db';
import { normalizeImage, UnsupportedImageError } from '@store-mgmt/infra-storage';
import type { Request, Response } from 'express';
import { assertNotMintedRef } from '../image/assert-not-minted-ref.js';
import { streamImage } from '../image/stream-image.js';
import { ProductService } from './product.service.js';
import type {
  CreateProductDto,
  MoneyAmountDto,
  ProductResponseDto,
  UpdateProductDto,
} from './dto/index.js';

/** `Request` carrying `req.tenant`, set by `TenantContextGuard` (design D4/D5). */
type TenantScopedRequest = Request & { tenant: TenantContext };

const VALID_CURRENCIES = new Set<string>(['USD', 'EUR', 'MN']);

/** Validates a `MoneyAmountDto.currency` — REQUIRED, from the Currency set. */
function assertCurrency(amount: MoneyAmountDto): void {
  if (!VALID_CURRENCIES.has(amount.currency)) {
    throw new BadRequestException(`Unknown currency: "${amount.currency}"`);
  }
}

/** design.md §5 — 10MB upload ceiling. */
const MAX_PRODUCT_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * design.md §5's upload allowlist, matched against the type `FileTypeValidator`
 * DETECTS from the bytes — Nest 11 ships magic-number inspection (the
 * `file-type` package) on by default and we deliberately leave it on, so a
 * client-declared `Content-Type` cannot talk its way past this.
 *
 * This is a widening of D10, not a contradiction of it. D10 makes `sharp` the
 * authority on whether bytes are a usable image, and it still is. What the
 * signature check buys is narrower and worth more: attacker-controlled bytes
 * stop at a pure-JS check and never reach libvips, a large native decoder
 * whose format parsers are exactly the kind of code you do not want to hand
 * arbitrary input. Rejecting twice costs a few microseconds; rejecting once,
 * inside the native decoder, is the risk.
 *
 * `avif` is in the list because it has to be, not for completeness: `sharp`
 * decodes AVIF, and `file-type` reports it as `image/avif`. Omit it and a
 * format the pipeline handles perfectly well fails at the door — an allowlist
 * has to describe real capability, not an assumption about it. `heic`/`heif`
 * decode via libheif; encoding them is unsupported in this build and does not
 * matter, since every upload is re-encoded to webp.
 */
const ALLOWED_PRODUCT_IMAGE_MIME_TYPES = /^image\/(jpeg|png|webp|avif|heic|heif)$/;

/**
 * REST delivery for the Product module. Validates `price`/`cost` currency at
 * the boundary (`price`/`cost` MAY differ) and maps `InvalidProductError`
 * (e.g. missing/nonexistent `categoryId`) and `InvalidMoneyError` (malformed
 * decimal string) -> 400. `GET /:id` returns even soft-deleted products
 * (historical references, e.g. past orders); `GET /products` excludes them
 * by default. `DELETE` always soft-deletes — never a hard DELETE. Catalog
 * reads are open to any authenticated user; writes are `owner`/`admin`-only
 * (backend-users-roles permission matrix).
 */
@Controller('products')
@UseGuards(JwtAuthGuard, TenantContextGuard, RolesGuard)
export class ProductController {
  private readonly logger = new Logger(ProductController.name);
  private readonly runInTenant: ReturnType<typeof createRunInTenant>;

  constructor(
    private readonly productService: ProductService,
    tenantContext: TenantContextService,
    @Inject(IMAGE_STORE) private readonly imageStore: IImageStore,
  ) {
    this.runInTenant = createRunInTenant(tenantContext);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(USER_ROLES.owner, USER_ROLES.admin)
  async create(
    @Body() body: CreateProductDto,
    @Req() req: TenantScopedRequest,
  ): Promise<ProductResponseDto> {
    assertCurrency(body.price);
    assertCurrency(body.cost);
    assertNotMintedRef(body.image, 'products');
    return this.runInTenant(req.tenant, () =>
      this.withDomainErrorMapping(() => this.productService.create(body)),
    );
  }

  @Get()
  async list(
    @Query('includeInactive') includeInactive: string | undefined,
    @Query('categoryId') categoryId: string | undefined,
    @Req() req: TenantScopedRequest,
  ): Promise<ProductResponseDto[]> {
    return this.runInTenant(req.tenant, () =>
      this.productService.list(includeInactive === 'true', categoryId),
    );
  }

  @Get(':id')
  async findById(
    @Param('id') id: string,
    @Req() req: TenantScopedRequest,
  ): Promise<ProductResponseDto> {
    return this.runInTenant(req.tenant, async () => {
      const found = await this.productService.findById(id);
      if (!found) {
        throw new NotFoundException(`Product "${id}" not found`);
      }
      return found;
    });
  }

  @Patch(':id')
  @Roles(USER_ROLES.owner, USER_ROLES.admin)
  async update(
    @Param('id') id: string,
    @Body() body: UpdateProductDto,
    @Req() req: TenantScopedRequest,
  ): Promise<ProductResponseDto> {
    assertNotMintedRef(body.image, 'products');
    if (body.price !== undefined) {
      assertCurrency(body.price);
    }
    if (body.cost !== undefined) {
      assertCurrency(body.cost);
    }
    return this.runInTenant(req.tenant, () =>
      this.withDomainErrorMapping(() => this.productService.update(id, body)),
    );
  }

  /**
   * `POST /products/:id/image` (design.md §5, spec: salesops-products).
   * `FileInterceptor` + `ParseFilePipe` are a cheap client-declared-Content-Type
   * filter (size, then MIME allowlist — 413 vs 400 respectively); the REAL
   * content gate is `normalizeImage`'s `sharp` decode (design.md D10).
   * `PutProductImageInput` carries no filename field at all — the stored
   * extension can only ever come from the normalized (always-WebP) output,
   * never the client-supplied filename.
   */
  @Post(':id/image')
  @HttpCode(HttpStatus.OK)
  @Roles(USER_ROLES.owner, USER_ROLES.admin)
  @UseInterceptors(FileInterceptor('image'))
  async uploadImage(
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: MAX_PRODUCT_IMAGE_SIZE_BYTES })],
        errorHttpStatusCode: HttpStatus.PAYLOAD_TOO_LARGE,
      }),
      new ParseFilePipe({
        validators: [
          new FileTypeValidator({ fileType: ALLOWED_PRODUCT_IMAGE_MIME_TYPES }),
        ],
        errorHttpStatusCode: HttpStatus.BAD_REQUEST,
      }),
    )
    file: Express.Multer.File,
    @Req() req: TenantScopedRequest,
  ): Promise<ProductResponseDto> {
    return this.runInTenant(req.tenant, async () => {
      const existing = await this.productService.findById(id);
      if (!existing) {
        throw new NotFoundException(`Product "${id}" not found`);
      }
      return this.withDomainErrorMapping(async () => {
        const previousRef = existing.image;
        const normalized = await normalizeImage(file.buffer);
        const ref = await this.imageStore.put({
          companyId: req.tenant.companyId,
          collection: 'products',
          bytes: normalized.bytes,
          declaredMimeType: normalized.contentType,
        });
        const updated = await this.productService.update(id, { image: ref });

        // AFTER the update commits, never before: deleting first would
        // destroy the live file if the update then failed. Once the row
        // points at the new ref, the old one is already unreachable — the
        // public image URL is keyed on the CURRENT ref (`imageKeyMatchesRef`
        // in api-public), so a stale URL 404s whether or not these bytes
        // still exist. This just reclaims the disk.
        if (isUploadMintedRef(previousRef, 'products') && previousRef !== ref) {
          try {
            await this.imageStore.delete(req.tenant.companyId, previousRef);
          } catch (err) {
            // The upload succeeded and the row is updated — the caller's
            // action is done. A failed cleanup leaves an orphaned file,
            // which is acceptable residue, not a reason to report failure.
            this.logger.warn(
              `PRODUCT_IMAGE_CLEANUP_FAILED: company ${req.tenant.companyId}, product ${id}, ref ${previousRef}: ${String(err)}`,
            );
          }
        }

        return updated;
      });
    });
  }

  /**
   * Admin image read (design.md D5). Any authenticated member may read; this
   * mirrors the rest of the catalogue, where reads are open and writes are
   * owner/admin-only. Unlike `GET /public/products/:id/image/:key`, this
   * serves inactive rows.
   */
  @Get(':id/image')
  async getImage(
    @Param('id') id: string,
    @Req() req: TenantScopedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return this.runInTenant(req.tenant, async () => {
      const existing = await this.productService.findById(id);
      if (!existing) {
        throw new NotFoundException(`Product "${id}" not found`);
      }
      return streamImage(this.imageStore, req.tenant.companyId, existing.image, res);
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles(USER_ROLES.owner, USER_ROLES.admin)
  async softDelete(
    @Param('id') id: string,
    @Req() req: TenantScopedRequest,
  ): Promise<{ id: string }> {
    await this.runInTenant(req.tenant, () => this.productService.softDelete(id));
    return { id };
  }

  private async withDomainErrorMapping<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof InvalidProductError || err instanceof InvalidMoneyError) {
        throw new BadRequestException(err.message);
      }
      // `sharp` failing to decode is the REAL validation gate (design.md
      // D10) — mapped to a controlled 400, never an uncaught rejection.
      if (err instanceof UnsupportedImageError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }
}
