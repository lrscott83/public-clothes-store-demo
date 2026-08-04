import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
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
  DuplicateCustomerDocumentError,
  DuplicateCustomerUserError,
  DuplicateLoginError,
  InvalidCustomerError,
  InvalidUserError,
  USER_ROLES,
} from '@store-mgmt/domain';
import { TenantContextService, type TenantContext } from '@store-mgmt/infra-db';
import type { Request } from 'express';
import { CustomerIdentityService } from './customer-identity.service.js';
import type { CreateCustomerWithIdentityDto, CustomerResponseDto } from './dto/index.js';

/** `Request` carrying the `req.user` populated by `JwtStrategy` and `req.tenant` set by `TenantContextGuard` — never carries `passwordHash`. */
type AuthenticatedRequest = Request & { user: SanitizedUser; tenant: TenantContext };

/** Minimum password length — the same floor `api-idp`'s `CreateUserDto` enforces via `@MinLength(8)`. */
const MIN_PASSWORD_LENGTH = 8;

function assertNonBlank(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException(`${field} must be a non-empty string`);
  }
}

function assertMinLength(value: unknown, field: string, min: number): asserts value is string {
  if (typeof value !== 'string' || value.length < min) {
    throw new BadRequestException(`${field} must be at least ${min} characters long`);
  }
}

/**
 * REST delivery for `POST /customers/with-identity` — signing up a walk-in
 * customer, login included.
 *
 * A SEPARATE controller from `CustomerController` on purpose. The existing
 * `POST /customers` links an arbitrary EXISTING `userId`, so granting it to a
 * `sales_agent` would let an agent bind a customer record to any identity, the
 * owner's included. This route mints the identity itself and never honours a
 * caller-supplied `userId`, which is exactly why the agent may call it. Keeping
 * them apart also leaves the existing route's tests untouched.
 *
 * The asserts below ARE the validation: this app installs no global
 * `ValidationPipe`, so the DTO is erased at runtime and the body arrives
 * exactly as sent. Same house pattern as `assertCurrency`/`assertChannel` in
 * `OrderController`. They run BEFORE the service, so a malformed request costs
 * no writes and no password hashing.
 */
@Controller('customers')
@UseGuards(JwtAuthGuard, TenantContextGuard, RolesGuard)
@Roles(
  USER_ROLES.owner,
  USER_ROLES.admin,
  USER_ROLES.sales_operator,
  USER_ROLES.sales_agent,
)
export class CustomerIdentityController {
  private readonly runInTenant: ReturnType<typeof createRunInTenant>;

  constructor(
    private readonly customerIdentityService: CustomerIdentityService,
    tenantContext: TenantContextService,
  ) {
    this.runInTenant = createRunInTenant(tenantContext);
  }

  @Post('with-identity')
  @HttpCode(HttpStatus.CREATED)
  async createWithIdentity(
    @Body() body: CreateCustomerWithIdentityDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<CustomerResponseDto> {
    assertNonBlank(body?.fullName, 'fullName');
    assertNonBlank(body?.login, 'login');
    assertMinLength(body?.password, 'password', MIN_PASSWORD_LENGTH);

    // Provenance (`createdByCompanyUserId`) comes from the authenticated
    // actor and ONLY from there — `req.user.companyUserId` is guaranteed
    // present: `JwtStrategy`/`TenantContextGuard` refuse to hand back a
    // resolved `req.user` at all without an ACTIVE `CompanyUser` assignment.
    // Tenant SCOPE is `req.tenant`, opened by `runInTenant` here, not a field
    // on `actor` — the tenant CompanyUser write inside the service resolves
    // its client from THIS scope (design D5); the service opens none of its
    // own.
    return this.runInTenant(req.tenant, () =>
      this.withDomainErrorMapping(() =>
        this.customerIdentityService.createWithIdentity(
          { companyUserId: req.user.companyUserId },
          body,
        ),
      ),
    );
  }

  private async withDomainErrorMapping<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof InvalidUserError || err instanceof InvalidCustomerError) {
        throw new BadRequestException(err.message);
      }
      // A login collision is the ONE conflict that costs nothing: it fires on
      // the first write, so no identity, no assignment and no customer exist.
      if (err instanceof DuplicateLoginError) {
        throw new ConflictException(err.message);
      }
      if (err instanceof DuplicateCustomerDocumentError) {
        throw new ConflictException(err.message);
      }
      if (err instanceof DuplicateCustomerUserError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }
}
