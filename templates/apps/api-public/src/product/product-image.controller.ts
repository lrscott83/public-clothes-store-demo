import { Readable } from 'node:stream';
import {
  Controller,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  InvalidProductImageRefError,
  PRODUCT_IMAGE_STORE,
  assertProductImageRef,
  type IProductImageStore,
} from '@store-mgmt/domain';
import { TenantContextService } from '@store-mgmt/infra-db';
import type { Response } from 'express';
import { PublicTenantGuard, type PublicTenantRequest } from '../tenant/public-tenant.guard.js';
import { createRunInTenant } from '../tenant/run-in-tenant.js';
import { imageKeyMatchesRef } from './image-url.js';
import { PublicProductService } from './public-product.service.js';

/** design.md D6 — long-lived, immutable, public. Never `private`, never a short TTL. */
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

function notFound(): NotFoundException {
  return new NotFoundException('Not Found');
}

/**
 * `GET /public/products/:id/image/:imageKey` (design.md D6). Unauthenticated
 * (only `PublicTenantGuard`), but never serves an inactive product's image
 * and never serves one tenant's file to another tenant's subdomain —
 * `findActiveById` is scoped to the resolved tenant schema, and
 * `IProductImageStore.open` additionally takes `req.tenant.companyId`
 * explicitly (D1: tenancy is in the signature, not ambient state; defense
 * in depth on top of Postgres schema isolation). Bytes are streamed via
 * `StreamableFile`, never buffered.
 *
 * Every rejection branch below maps to `404` — never `400`, never `500` for
 * a well-formed request. Echoing "malformed ref" or "file missing" as
 * anything other than a generic 404 is a traversal/enumeration oracle
 * (mirrors design D4's byte-identical discipline, applied to images).
 */
@Controller('public/products')
@UseGuards(PublicTenantGuard)
export class ProductImageController {
  private readonly logger = new Logger(ProductImageController.name);
  private readonly runInTenant: ReturnType<typeof createRunInTenant>;

  constructor(
    private readonly publicProductService: PublicProductService,
    @Inject(PRODUCT_IMAGE_STORE) private readonly productImageStore: IProductImageStore,
    tenantContext: TenantContextService,
  ) {
    this.runInTenant = createRunInTenant(tenantContext);
  }

  @Get(':id/image/:imageKey')
  async getImage(
    @Param('id') id: string,
    @Param('imageKey') imageKey: string,
    @Req() req: PublicTenantRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile | undefined> {
    return this.runInTenant(req.tenant, async () => {
      const item = await this.publicProductService.findActiveById(id);
      if (!item) {
        throw notFound();
      }

      const ref = item.product.image;
      if (!this.isValidRef(ref, id)) {
        throw notFound();
      }

      if (!imageKeyMatchesRef(imageKey, ref)) {
        // A stale URL (post re-upload) or a guessed key — same 404 as every
        // other branch here, never a hint about which case occurred.
        throw notFound();
      }

      res.setHeader('Cache-Control', CACHE_CONTROL);
      res.setHeader('ETag', `"${imageKey}"`);

      if (req.headers['if-none-match'] === `"${imageKey}"`) {
        res.status(304);
        return undefined;
      }

      const content = await this.productImageStore.open(req.tenant.companyId, ref);
      if (!content) {
        this.logger.error(
          `PRODUCT_IMAGE_MISSING: company ${req.tenant.companyId}, product ${id}, ref ${ref}`,
        );
        throw notFound();
      }

      res.status(200);
      return new StreamableFile(Readable.from(content.stream), {
        type: content.contentType,
        length: content.byteLength,
      });
    });
  }

  private isValidRef(ref: string, productId: string): boolean {
    try {
      assertProductImageRef(ref);
      return true;
    } catch (err) {
      if (err instanceof InvalidProductImageRefError) {
        this.logger.error(`PRODUCT_IMAGE_REF_INVALID: product ${productId}, ref ${JSON.stringify(ref)}`);
        return false;
      }
      throw err;
    }
  }
}
