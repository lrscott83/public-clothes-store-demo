import {
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
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, Roles, RolesGuard, TenantContextGuard, createRunInTenant } from '@store-mgmt/api-common';
import {
  CarrierHasOpenAssignmentsError,
  CarrierNotFoundError,
  ConcurrentWriteConflictError,
  CoverageAlreadyDeclaredError,
  CoverageWarehouseNotFoundError,
  PersistenceTimeoutError,
  USER_ROLES,
} from '@store-mgmt/domain';
import { TenantContextService, type TenantContext } from '@store-mgmt/infra-db';
import type { Request } from 'express';
import { DeliveryService } from './delivery.service.js';
import {
  assertNonEmptyString,
  assertOptionalBoolean,
  assertOptionalNonEmptyString,
  assertOptionalNullableString,
  assertOptionalUuid,
  assertUuid,
} from './request-validation.js';
import type {
  AddCarrierCoverageDto,
  CarrierCoverageResponseDto,
  CarrierResponseDto,
  CreateCarrierDto,
  UpdateCarrierDto,
} from './dto/index.js';

/** `Request` carrying `req.tenant`, set by `TenantContextGuard` (design D4/D5). */
type TenantScopedRequest = Request & { tenant: TenantContext };

/**
 * REST delivery for the Carrier catalog and its warehouse coverage. Reads
 * carry no `@Roles` — open to any authenticated tenant user, mirroring
 * `product.controller.ts`/`warehouse.controller.ts` (spec: "Any authenticated
 * tenant user can read carriers"). Writes (`POST`/`PATCH`/soft-`DELETE`, and
 * the two coverage writes) require `owner`/`admin` (spec: "Carrier Catalog
 * Roles Mirror Existing Master Data"). `DELETE /delivery/carriers/:id` always
 * soft-deletes (`active=false`) — never a hard DELETE.
 *
 * Every endpoint validates EVERY value it forwards to a `@db.Uuid` column —
 * path params included, not just bodies. This app installs no global
 * `ValidationPipe` and DTO classes are erased at runtime, so `@Body() body:
 * CreateCarrierDto` is a compile-time claim, not a check, and `@Param('id')`
 * is a bare string. A malformed uuid reaching Postgres is an "invalid input
 * syntax for type uuid" error (Prisma P2007) — a 500 for what is plainly a
 * bad request. `removeCoverage` validated `:warehouseId` and not `:id`, in
 * the same signature; that asymmetry is what this sweep removes. See
 * `request-validation.ts` and `sales/order.controller.ts`'s own note.
 *
 * The coverage writes are what make `coversWarehouse` capable of ever being
 * `true`. Coverage stays ADVISORY: it is surfaced on reads and NEVER blocks
 * an assignment (ADR-4, spec: "Coverage Is Advisory, Not an Enforced
 * Assignment Block").
 */
@Controller('delivery/carriers')
@UseGuards(JwtAuthGuard, TenantContextGuard, RolesGuard)
export class CarrierController {
  private readonly runInTenant: ReturnType<typeof createRunInTenant>;

  constructor(
    private readonly deliveryService: DeliveryService,
    tenantContext: TenantContextService,
  ) {
    this.runInTenant = createRunInTenant(tenantContext);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(USER_ROLES.owner, USER_ROLES.admin)
  async create(
    @Body() body: CreateCarrierDto,
    @Req() req: TenantScopedRequest,
  ): Promise<CarrierResponseDto> {
    assertNonEmptyString(body?.name, 'name');
    assertOptionalNullableString(body?.phone, 'phone');
    assertOptionalBoolean(body?.active, 'active');
    return this.runInTenant(req.tenant, () =>
      this.withDomainErrorMapping(() => this.deliveryService.createCarrier(body)),
    );
  }

  @Get()
  async list(
    @Query('warehouseId') warehouseId: string | undefined,
    @Req() req: TenantScopedRequest,
  ): Promise<CarrierResponseDto[]> {
    // A UUID, not merely non-empty: `coversWarehouse` is resolved with a
    // `listByWarehouse` query against a `@db.Uuid` column, so a malformed
    // value reaches Postgres as invalid uuid syntax (P2007) and is a 500.
    assertOptionalUuid(warehouseId, 'warehouseId');
    return this.runInTenant(req.tenant, () => this.deliveryService.listCarriers({ warehouseId }));
  }

  @Get(':id')
  async findById(@Param('id') id: string, @Req() req: TenantScopedRequest): Promise<CarrierResponseDto> {
    assertUuid(id, 'id');
    return this.runInTenant(req.tenant, async () => {
      const found = await this.deliveryService.findCarrierById(id);
      if (!found) {
        throw new NotFoundException(`Carrier "${id}" not found`);
      }
      return found;
    });
  }

  @Patch(':id')
  @Roles(USER_ROLES.owner, USER_ROLES.admin)
  async update(
    @Param('id') id: string,
    @Body() body: UpdateCarrierDto,
    @Req() req: TenantScopedRequest,
  ): Promise<CarrierResponseDto> {
    assertUuid(id, 'id');
    assertOptionalNonEmptyString(body?.name, 'name');
    assertOptionalNullableString(body?.phone, 'phone');
    assertOptionalBoolean(body?.active, 'active');
    return this.runInTenant(req.tenant, () =>
      this.withDomainErrorMapping(() => this.deliveryService.updateCarrier(id, body)),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles(USER_ROLES.owner, USER_ROLES.admin)
  async softDelete(
    @Param('id') id: string,
    @Req() req: TenantScopedRequest,
  ): Promise<{ id: string }> {
    assertUuid(id, 'id');
    await this.runInTenant(req.tenant, () =>
      this.withDomainErrorMapping(() => this.deliveryService.deactivateCarrier(id)),
    );
    return { id };
  }

  /** Declares that this carrier serves a warehouse. Advisory — never gates assignment. */
  @Post(':id/warehouses')
  @HttpCode(HttpStatus.CREATED)
  @Roles(USER_ROLES.owner, USER_ROLES.admin)
  async addCoverage(
    @Param('id') id: string,
    @Body() body: AddCarrierCoverageDto,
    @Req() req: TenantScopedRequest,
  ): Promise<CarrierCoverageResponseDto> {
    assertUuid(id, 'id');
    assertUuid(body?.warehouseId, 'warehouseId');
    return this.runInTenant(req.tenant, () =>
      this.withDomainErrorMapping(() => this.deliveryService.addCarrierCoverage(id, body.warehouseId)),
    );
  }

  /** Withdraws a coverage declaration. Removing coverage that was never declared is not an error. */
  @Delete(':id/warehouses/:warehouseId')
  @HttpCode(HttpStatus.OK)
  @Roles(USER_ROLES.owner, USER_ROLES.admin)
  async removeCoverage(
    @Param('id') id: string,
    @Param('warehouseId') warehouseId: string,
    @Req() req: TenantScopedRequest,
  ): Promise<{ carrierId: string; warehouseId: string }> {
    assertUuid(id, 'id');
    assertUuid(warehouseId, 'warehouseId');
    await this.runInTenant(req.tenant, () =>
      this.withDomainErrorMapping(() => this.deliveryService.removeCarrierCoverage(id, warehouseId)),
    );
    return { carrierId: id, warehouseId };
  }

  /**
   * `CarrierNotFoundError`/`CoverageWarehouseNotFoundError` -> 404 — the
   * caller named something that does not exist.
   * `CarrierHasOpenAssignmentsError`/`CoverageAlreadyDeclaredError` -> 409:
   * the request is well-formed, the world just cannot satisfy it right now —
   * the carrier still holds in-flight orders that deactivating would make
   * invisible to every operational read at once, or the coverage pair is
   * already declared (mirrors `order.controller.ts`'s 409 class).
   *
   * Deliberately NO `WarehouseScopeViolationError` branch. Carriers and their
   * coverage are TENANT-WIDE master data: no path in this controller applies
   * a warehouse scope, so nothing here can raise it. The branch existed and
   * was unreachable, which is worse than absent — a reader takes a mapping in
   * an error translator as evidence that the error occurs, and would go
   * looking for the scope check that produces it. If a carrier read ever does
   * become scoped, add the branch back WITH the check.
   */
  private async withDomainErrorMapping<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof CarrierNotFoundError || err instanceof CoverageWarehouseNotFoundError) {
        throw new NotFoundException(err.message);
      }
      if (
        err instanceof CarrierHasOpenAssignmentsError ||
        err instanceof CoverageAlreadyDeclaredError ||
        // `deactivateGuarded` takes the SAME carrier row lock
        // `PrismaDeliveryAssignmentRepository.create` takes, on the same
        // budget, so it can end as a deadlock victim or on a `lock_timeout`
        // exactly as the assign path can. Untranslated, that was a 500 on a
        // door whose whole point is to answer 409 for a conflict.
        err instanceof ConcurrentWriteConflictError
      ) {
        throw new ConflictException(err.message);
      }
      if (err instanceof PersistenceTimeoutError) {
        throw new ServiceUnavailableException(err.message);
      }
      throw err;
    }
  }
}
