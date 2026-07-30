import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, Roles, RolesGuard, type SanitizedUser } from '@store-mgmt/api-common';
import { CommissionAlreadySettledError, USER_ROLES } from '@store-mgmt/domain';
import type { Request } from 'express';
import { isScopedSalesAgent } from '../auth/role-scope.js';
import { AccrualNotFoundError, CommissionService } from './commission.service.js';
import type {
  CommissionAccrualResponseDto,
  CommissionPaymentResponseDto,
  CommissionReportRowDto,
  RecordCommissionPaymentDto,
} from './dto/index.js';

/** `Request` carrying the `req.user` populated by `JwtStrategy` — never carries `passwordHash`. */
type AuthenticatedRequest = Request & { user: SanitizedUser };

/**
 * REST delivery for the Commission module.
 *
 * READ routes admit `sales_agent`, scoped to their OWN accruals — an agent
 * should be able to check what they have earned without being able to see what
 * anyone else earned. SETTLEMENT is `owner`/`admin` only: recording a payment
 * is a financial act, and nobody marks their own commission as paid.
 *
 * There is no route here that creates an accrual. Accrual happens on delivery
 * and nowhere else, so there is no HTTP surface through which one could be
 * conjured for an order that was never delivered.
 */
@Controller('commissions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(USER_ROLES.owner, USER_ROLES.admin)
export class CommissionController {
  constructor(private readonly commissionService: CommissionService) {}

  @Get('accruals')
  @Roles(USER_ROLES.owner, USER_ROLES.admin, USER_ROLES.sales_operator, USER_ROLES.sales_agent)
  async listAccruals(@Req() req: AuthenticatedRequest): Promise<CommissionAccrualResponseDto[]> {
    return this.commissionService.listAccruals(this.scopeFor(req.user));
  }

  @Get('report')
  @Roles(USER_ROLES.owner, USER_ROLES.admin, USER_ROLES.sales_operator, USER_ROLES.sales_agent)
  async report(@Req() req: AuthenticatedRequest): Promise<CommissionReportRowDto[]> {
    return this.commissionService.report(this.scopeFor(req.user));
  }

  @Post('payments')
  @HttpCode(HttpStatus.CREATED)
  async recordPayment(
    @Body() body: RecordCommissionPaymentDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<CommissionPaymentResponseDto> {
    // No global ValidationPipe runs in this app, so the DTO is erased at
    // runtime and this assert IS the validation.
    if (typeof body?.accrualId !== 'string' || body.accrualId.trim().length === 0) {
      throw new BadRequestException('accrualId must be a non-empty string');
    }
    if (body.paidAt !== undefined && Number.isNaN(new Date(body.paidAt).getTime())) {
      throw new BadRequestException(`paidAt is not a valid timestamp: "${body.paidAt}"`);
    }

    try {
      return await this.commissionService.recordPayment(
        // Rebuilt field by field, never forwarded whole. With no
        // `ValidationPipe` the body arrives intact, so a caller-supplied
        // `amount` would otherwise travel all the way to the service — where
        // it is ignored today, and where one future line could start reading
        // it. What is owed is the accrual's frozen total, and the only way to
        // keep that true is for the caller's figure never to arrive.
        { accrualId: body.accrualId, paidAt: body.paidAt, note: body.note },
        req.user.companyUserId,
      );
    } catch (err) {
      if (err instanceof AccrualNotFoundError) {
        throw new NotFoundException(err.message);
      }
      // 409, not 400: the request is well-formed, it just conflicts with a
      // settlement that already happened. Same class as the order module's
      // state conflicts.
      if (err instanceof CommissionAlreadySettledError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }

  /** `undefined` = see everything. An agent sees only their own; a supervisor sees the company. */
  private scopeFor(user: SanitizedUser): string | undefined {
    return isScopedSalesAgent(user) ? user.companyUserId : undefined;
  }
}
