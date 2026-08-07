import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import {
  JwtAuthGuard,
  Roles,
  RolesGuard,
  TenantContextGuard,
  createRunInTenant,
  type SanitizedUser,
} from '@store-mgmt/api-common';
import {
  CarrierNotFoundError,
  ConcurrentWriteConflictError,
  InsufficientStockError,
  InvalidAssignmentStateError,
  InvalidOrderStateError,
  NegativeStockError,
  OrderAlreadyAssignedError,
  OrderNotAssignableStateError,
  OrderNotFoundForDeliveryError,
  PersistenceTimeoutError,
  PickupOrderCannotBeAssignedError,
  USER_ROLES,
  WarehouseScopeViolationError,
  type DeliveryAssignmentStatus,
} from '@store-mgmt/domain';
import { TenantContextService, type TenantContext } from '@store-mgmt/infra-db';
import type { Request } from 'express';
import { DeliveryService } from './delivery.service.js';
import {
  assertOptionalUuid,
  assertOrderedWindow,
  assertUuid,
  parseDateParam,
  parsePositiveIntParam,
} from './request-validation.js';
import type {
  AssignCarrierDto,
  CarrierCapacityResponseDto,
  DeliveryAssignmentResponseDto,
} from './dto/index.js';

/** `Request` carrying `req.user` (set by `JwtStrategy`) and `req.tenant` (set by `TenantContextGuard`, design D4/D5). */
type AuthenticatedRequest = Request & { user: SanitizedUser; tenant: TenantContext };

const VALID_ASSIGNMENT_STATUSES = new Set<string>(['in_transit', 'delivered', 'cancelled']);

/**
 * Who may read the assignment/capacity surface.
 *
 * These reads used to carry NO `@Roles` at all — any authenticated tenant
 * user, including a `sales_agent`. `GET /delivery/assignments` names an
 * `orderId` for every delivery order in the tenant, and Sales deliberately
 * does NOT let an agent see that: `OrderController` filters its list to the
 * agent's own attributions and 403s a foreign `GET /orders/:id`. Delivery was
 * a second, unguarded door onto the same identifiers.
 *
 * `sales_agent` is therefore excluded outright rather than scoped: Delivery
 * carries no attribution column to scope BY, and an agent has no delivery
 * duties — this mirrors `OrderController`'s own class-level grant, which
 * likewise does not include `sales_agent` by default.
 * `warehouse_operator` IS included, and is scoped to their own warehouse
 * inside `DeliveryService`, exactly as Sales scopes them.
 */
const DELIVERY_READ_ROLES = [
  USER_ROLES.owner,
  USER_ROLES.admin,
  USER_ROLES.sales_operator,
  USER_ROLES.warehouse_operator,
] as const;

/**
 * Validates the `?status=` filter. This app installs no global
 * `ValidationPipe` and DTO classes are erased at runtime (see
 * `order.controller.ts`'s own note), so without this an unknown value reached
 * Prisma as an invalid enum member and crashed with a 500 instead of a clean
 * 400 — the same reason `OrderController.assertCurrency` exists.
 */
function assertAssignmentStatus(value: string | undefined): void {
  if (value !== undefined && !VALID_ASSIGNMENT_STATUSES.has(value)) {
    throw new BadRequestException(`Unknown assignment status: "${value}"`);
  }
}

/**
 * REST delivery for `DeliveryAssignment` reads, the capacity snapshot,
 * `POST /delivery/assignments` (task 6.3/6.4), and
 * `POST /delivery/assignments/:id/deliver` (task 6.5/6.6, Phase 6b — the
 * `IOrderDeliveryGateway`/`SalesModule` door). `assign`/`markDelivered`
 * require `owner`/`admin`/`warehouse_operator` — mirrors
 * `POST /orders/:id/deliver`'s roles exactly (spec: "Assigning a carrier and
 * marking an assignment delivered are OPERATIONS, not master-data writes").
 *
 * The READS are restricted too, and scoped — see `DELIVERY_READ_ROLES`. They
 * used to carry no `@Roles` and no scoping at all, which made this a second
 * door onto identifiers Sales deliberately does not hand out.
 *
 * EVERY handler forwards `req.user` to the service, which applies the SAME
 * warehouse scope `POST /orders/:id/deliver` and `GET /orders` apply. The
 * roles alone were never enough: these endpoints drive (or expose) the same
 * orders, so a scope enforced on only some of them is a bypass, not a
 * narrower grant.
 *
 * `by-order/:orderId` MUST tolerate a missing assignment — `null` is the
 * modelled meaning of "pickup, or delivered before this module existed",
 * never a 404 (design §6).
 */
@Controller('delivery')
@UseGuards(JwtAuthGuard, TenantContextGuard, RolesGuard)
export class DeliveryAssignmentController {
  private readonly runInTenant: ReturnType<typeof createRunInTenant>;

  constructor(
    private readonly deliveryService: DeliveryService,
    tenantContext: TenantContextService,
  ) {
    this.runInTenant = createRunInTenant(tenantContext);
  }

  @Post('assignments')
  @HttpCode(HttpStatus.CREATED)
  @Roles(USER_ROLES.owner, USER_ROLES.admin, USER_ROLES.warehouse_operator)
  async assign(
    @Body() body: AssignCarrierDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<DeliveryAssignmentResponseDto> {
    // UUIDs, not merely non-empty: both reach `@db.Uuid` columns
    // (`delivery_assignment.order_id`/`carrier_id`), where a malformed value
    // is a Postgres P2007 — a 500 for a plainly bad request.
    assertUuid(body?.orderId, 'orderId');
    assertUuid(body?.carrierId, 'carrierId');
    return this.runInTenant(req.tenant, () =>
      this.withDomainErrorMapping(() => this.deliveryService.assign(body, req.user)),
    );
  }

  /**
   * `IDeliveryAssignmentRepository` never learns a `markDelivered` write —
   * `DeliveryService.markDelivered` re-reads after delegating to
   * `IOrderDeliveryGateway`, so `null` (unknown id) is the only "not found"
   * outcome to map here; `InvalidAssignmentStateError` covers the
   * not-`in_transit` guard.
   */
  @Post('assignments/:id/deliver')
  @HttpCode(HttpStatus.OK)
  @Roles(USER_ROLES.owner, USER_ROLES.admin, USER_ROLES.warehouse_operator)
  async markDelivered(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<DeliveryAssignmentResponseDto> {
    assertUuid(id, 'id');
    return this.runInTenant(req.tenant, () =>
      this.withDomainErrorMapping(async () => {
        const result = await this.deliveryService.markDelivered(id, req.user);
        if (!result) {
          throw new NotFoundException(`DeliveryAssignment "${id}" not found`);
        }
        return result;
      }),
    );
  }

  /**
   * BOUNDED, and it says so.
   *
   * With no query params this returns the assignments of the last
   * `DEFAULT_ASSIGNMENT_WINDOW_DAYS` days, newest first, up to
   * `DEFAULT_ASSIGNMENT_PAGE_SIZE` rows — not the tenant's whole history,
   * which is what it used to return with no window, no limit and no
   * pagination at all. `?from`/`?to` move the window, `?limit` sizes the page
   * (the adapter clamps the ceiling), and `?cursor` is the `id` of the last
   * row of the previous page.
   *
   * BREAKING, on purpose: a caller passing no params used to receive
   * everything and now receives one recent page. That belongs in the
   * changelog — the alternative was leaving a full-history unpaginated read on
   * the one endpoint in this module that returns whole rows.
   */
  @Get('assignments')
  @Roles(...DELIVERY_READ_ROLES)
  async list(
    @Query('status') status: DeliveryAssignmentStatus | undefined,
    @Query('carrierId') carrierId: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Req() req: AuthenticatedRequest,
  ): Promise<DeliveryAssignmentResponseDto[]> {
    assertAssignmentStatus(status);
    assertOptionalUuid(carrierId, 'carrierId');
    assertOptionalUuid(cursor, 'cursor');
    const window = { from: parseDateParam(from, 'from'), to: parseDateParam(to, 'to') };
    assertOrderedWindow(window.from, window.to);
    return this.runInTenant(req.tenant, () =>
      this.withDomainErrorMapping(() =>
        this.deliveryService.listAssignments(
          {
            ...(status !== undefined ? { status } : {}),
            ...(carrierId !== undefined ? { carrierId } : {}),
            ...(window.from !== undefined ? { from: window.from } : {}),
            ...(window.to !== undefined ? { to: window.to } : {}),
            ...(limit !== undefined ? { take: parsePositiveIntParam(limit, 'limit') } : {}),
            ...(cursor !== undefined ? { cursorId: cursor } : {}),
          },
          req.user,
        ),
      ),
    );
  }

  @Get('assignments/by-order/:orderId')
  @Roles(...DELIVERY_READ_ROLES)
  async findByOrderId(
    @Param('orderId') orderId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<DeliveryAssignmentResponseDto | null> {
    assertUuid(orderId, 'orderId');
    return this.runInTenant(req.tenant, () =>
      this.withDomainErrorMapping(() =>
        this.deliveryService.findAssignmentByOrderId(orderId, req.user),
      ),
    );
  }

  @Get('capacity')
  @Roles(...DELIVERY_READ_ROLES)
  async capacity(
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Req() req: AuthenticatedRequest,
  ): Promise<CarrierCapacityResponseDto> {
    const window = { from: parseDateParam(from, 'from'), to: parseDateParam(to, 'to') };
    assertOrderedWindow(window.from, window.to);
    // Wrapped like every other handler. This was the ONE that was not, so a
    // domain error raised anywhere under it — `ConcurrentWriteConflictError`
    // and `PersistenceTimeoutError` are reachable from any tenant read now
    // that the pool carries `lock_timeout`/`statement_timeout` — came back a
    // 500 from this door and a clean 409/503 from its siblings.
    return this.runInTenant(req.tenant, () =>
      this.withDomainErrorMapping(() => this.deliveryService.getCarrierCapacity(window)),
    );
  }

  /**
   * `CarrierNotFoundError`/`OrderNotFoundForDeliveryError` -> 404 (unknown OR
   * inactive carrier — one error, one status, per its own message; unknown
   * order likewise). Everything else here is the 409 class: the request is
   * well-formed, the world just cannot satisfy it right now.
   *
   * `InvalidOrderStateError`/`InsufficientStockError`/`NegativeStockError`
   * come from SALES, not Delivery — `markDelivered` runs Sales' whole
   * delivery transaction through `IOrderDeliveryGateway`, so every failure
   * `POST /orders/:id/deliver` maps to 409 can surface through this door too.
   * Unmapped, and with no global exception filter installed, they were 500s
   * here while being clean 409s there: the same transaction, the same
   * failure, two different answers depending on which door you used.
   */
  private async withDomainErrorMapping<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof WarehouseScopeViolationError) {
        throw new ForbiddenException(err.message);
      }
      if (err instanceof CarrierNotFoundError || err instanceof OrderNotFoundForDeliveryError) {
        throw new NotFoundException(err.message);
      }
      // The write lost a race it can win by being retried — a deadlock victim,
      // or a lock wait that hit the server-side `lock_timeout`. 409, the same
      // class as `OrderAlreadyAssignedError`: the request is well-formed and
      // another writer got there first. Untranslated, both were 500s, which is
      // how the mechanism introduced to STOP a class of 500 produced another
      // one (`lock-budget.ts`: P2028 "is exactly the outcome the locking was
      // introduced to prevent").
      if (err instanceof ConcurrentWriteConflictError) {
        throw new ConflictException(err.message);
      }
      // 503, not 500 and not 409: nothing is wrong with the request and no
      // domain rule refused it — the database was too slow or too contended
      // right now. That is an availability statement, and the honest answer is
      // "retry shortly".
      if (err instanceof PersistenceTimeoutError) {
        throw new ServiceUnavailableException(err.message);
      }
      if (
        err instanceof OrderAlreadyAssignedError ||
        err instanceof InvalidAssignmentStateError ||
        err instanceof PickupOrderCannotBeAssignedError ||
        // Delivery's own "this order is not in a state that can be assigned".
        // Same 409 `InvalidOrderStateError` gets, deliberately: the observable
        // contract did not change when the rule stopped borrowing Sales' error
        // class (see `OrderNotAssignableStateError`).
        err instanceof OrderNotAssignableStateError ||
        err instanceof InvalidOrderStateError ||
        err instanceof InsufficientStockError ||
        err instanceof NegativeStockError
      ) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }
}
