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
import { IMAGE_STORE, InvalidCategoryError, isUploadMintedRef, USER_ROLES, type IImageStore } from '@store-mgmt/domain';
import { TenantContextService, type TenantContext } from '@store-mgmt/infra-db';
import { normalizeImage, UnsupportedImageError } from '@store-mgmt/infra-storage';
import type { Request, Response } from 'express';
import { assertNotMintedRef } from '../image/assert-not-minted-ref.js';
import { streamImage } from '../image/stream-image.js';
import { ALLOWED_IMAGE_MIME_TYPES, MAX_IMAGE_SIZE_BYTES } from '../image/upload-constraints.js';
import { CategoryService } from './category.service.js';
import type { CategoryResponseDto, CreateCategoryDto, UpdateCategoryDto } from './dto/index.js';

/** `Request` carrying `req.tenant`, set by `TenantContextGuard` (design D4/D5). */
type TenantScopedRequest = Request & { tenant: TenantContext };

/**
 * REST delivery for the Category module. Maps `InvalidCategoryError` -> 400
 * (e.g. duplicate slug) and a not-found lookup -> 404. `DELETE` always
 * soft-deletes (`active=false`) — never a hard DELETE. Catalog reads are
 * open to any authenticated user; writes are `owner`/`admin`-only
 * (backend-users-roles permission matrix).
 */
@Controller('categories')
@UseGuards(JwtAuthGuard, TenantContextGuard, RolesGuard)
export class CategoryController {
  private readonly logger = new Logger(CategoryController.name);
  private readonly runInTenant: ReturnType<typeof createRunInTenant>;

  constructor(
    private readonly categoryService: CategoryService,
    tenantContext: TenantContextService,
    @Inject(IMAGE_STORE) private readonly imageStore: IImageStore,
  ) {
    this.runInTenant = createRunInTenant(tenantContext);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(USER_ROLES.owner, USER_ROLES.admin)
  async create(
    @Body() body: CreateCategoryDto,
    @Req() req: TenantScopedRequest,
  ): Promise<CategoryResponseDto> {
    assertNotMintedRef(body.image, 'categories');
    return this.runInTenant(req.tenant, () =>
      this.withDomainErrorMapping(() => this.categoryService.create(body)),
    );
  }

  @Get()
  async list(
    @Query('includeInactive') includeInactive: string | undefined,
    @Req() req: TenantScopedRequest,
  ): Promise<CategoryResponseDto[]> {
    return this.runInTenant(req.tenant, () => this.categoryService.list(includeInactive === 'true'));
  }

  @Get(':id')
  async findById(
    @Param('id') id: string,
    @Req() req: TenantScopedRequest,
  ): Promise<CategoryResponseDto> {
    return this.runInTenant(req.tenant, async () => {
      const found = await this.categoryService.findById(id);
      if (!found) {
        throw new NotFoundException(`Category "${id}" not found`);
      }
      return found;
    });
  }

  @Patch(':id')
  @Roles(USER_ROLES.owner, USER_ROLES.admin)
  async update(
    @Param('id') id: string,
    @Body() body: UpdateCategoryDto,
    @Req() req: TenantScopedRequest,
  ): Promise<CategoryResponseDto> {
    assertNotMintedRef(body.image, 'categories');
    return this.runInTenant(req.tenant, () =>
      this.withDomainErrorMapping(() => this.categoryService.update(id, body)),
    );
  }

  /**
   * `POST /categories/:id/image` (design.md §5, spec: salesops-products).
   * `FileInterceptor` + `ParseFilePipe` are a cheap client-declared-Content-Type
   * filter (size, then MIME allowlist — 413 vs 400 respectively); the REAL
   * content gate is `normalizeImage`'s `sharp` decode (design.md D10).
   * `PutImageInput` carries no filename field at all — the stored
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
        validators: [new MaxFileSizeValidator({ maxSize: MAX_IMAGE_SIZE_BYTES })],
        errorHttpStatusCode: HttpStatus.PAYLOAD_TOO_LARGE,
      }),
      new ParseFilePipe({
        validators: [
          new FileTypeValidator({ fileType: ALLOWED_IMAGE_MIME_TYPES }),
        ],
        errorHttpStatusCode: HttpStatus.BAD_REQUEST,
      }),
    )
    file: Express.Multer.File,
    @Req() req: TenantScopedRequest,
  ): Promise<CategoryResponseDto> {
    return this.runInTenant(req.tenant, async () => {
      const existing = await this.categoryService.findById(id);
      if (!existing) {
        throw new NotFoundException(`Category "${id}" not found`);
      }
      return this.withDomainErrorMapping(async () => {
        const previousRef = existing.image;
        const normalized = await normalizeImage(file.buffer);
        const ref = await this.imageStore.put({
          companyId: req.tenant.companyId,
          collection: 'categories',
          bytes: normalized.bytes,
          declaredMimeType: normalized.contentType,
        });
        const updated = await this.categoryService.update(id, { image: ref });

        // AFTER the update commits, never before: deleting first would
        // destroy the live file if the update then failed. Once the row
        // points at the new ref, the old one is already unreachable — the
        // public image URL is keyed on the CURRENT ref (`imageKeyMatchesRef`
        // in api-public), so a stale URL 404s whether or not these bytes
        // still exist. This just reclaims the disk.
        if (isUploadMintedRef(previousRef, 'categories') && previousRef !== ref) {
          try {
            await this.imageStore.delete(req.tenant.companyId, previousRef);
          } catch (err) {
            // The upload succeeded and the row is updated — the caller's
            // action is done. A failed cleanup leaves an orphaned file,
            // which is acceptable residue, not a reason to report failure.
            this.logger.warn(
              `IMAGE_CLEANUP_FAILED: company ${req.tenant.companyId}, category ${id}, ref ${previousRef}: ${String(err)}`,
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
   * owner/admin-only. Unlike `GET /public/categories/:id/image/:key`, this
   * serves inactive rows.
   */
  @Get(':id/image')
  async getImage(
    @Param('id') id: string,
    @Req() req: TenantScopedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return this.runInTenant(req.tenant, async () => {
      const existing = await this.categoryService.findById(id);
      if (!existing) {
        throw new NotFoundException(`Category "${id}" not found`);
      }
      return streamImage(this.imageStore, req.tenant.companyId, existing.image, res);
    });
  }

  /**
   * Removes a category's image (design.md D7). Same post-commit ordering as a
   * replace: the row stops pointing at the file BEFORE the bytes go, so a
   * failed update can never leave a row pointing at something deleted. Only
   * upload-minted refs are removed from disk — a seeded ref may be shared by
   * other rows and we cannot prove otherwise.
   */
  @Delete(':id/image')
  @HttpCode(HttpStatus.OK)
  @Roles(USER_ROLES.owner, USER_ROLES.admin)
  async removeImage(
    @Param('id') id: string,
    @Req() req: TenantScopedRequest,
  ): Promise<CategoryResponseDto> {
    return this.runInTenant(req.tenant, async () => {
      const existing = await this.categoryService.findById(id);
      if (!existing) {
        throw new NotFoundException(`Category "${id}" not found`);
      }

      const previousRef = existing.image;
      const updated = await this.categoryService.update(id, { image: null });

      if (isUploadMintedRef(previousRef, 'categories')) {
        try {
          await this.imageStore.delete(req.tenant.companyId, previousRef);
        } catch (err) {
          this.logger.warn(
            `IMAGE_CLEANUP_FAILED: company ${req.tenant.companyId}, category ${id}, ref ${previousRef}: ${String(err)}`,
          );
        }
      }

      return updated;
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles(USER_ROLES.owner, USER_ROLES.admin)
  async softDelete(
    @Param('id') id: string,
    @Req() req: TenantScopedRequest,
  ): Promise<{ id: string }> {
    await this.runInTenant(req.tenant, () => this.categoryService.softDelete(id));
    return { id };
  }

  private async withDomainErrorMapping<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof InvalidCategoryError) {
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
