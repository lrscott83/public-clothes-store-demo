import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, Roles, RolesGuard } from '@store-mgmt/api-common';
import type { Currency, PaymentChannel } from '@store-mgmt/domain';
import { CHANNEL_CURRENCY, InvalidMoneyError, RateNotFoundError, USER_ROLES } from '@store-mgmt/domain';
import { CurrencyService } from './currency.service.js';
import type { ConvertResponseDto, CreateRateDto, RateResponseDto } from './dto/index.js';

const VALID_CHANNELS = new Set<string>(Object.keys(CHANNEL_CURRENCY));
const VALID_CURRENCIES = new Set<string>(['USD', 'EUR', 'MN']);

function assertChannel(value: string): PaymentChannel {
  if (!VALID_CHANNELS.has(value)) {
    throw new BadRequestException(`Unknown payment channel: "${value}"`);
  }
  return value as PaymentChannel;
}

function assertCurrency(value: string): Currency {
  if (!VALID_CURRENCIES.has(value)) {
    throw new BadRequestException(`Unknown currency: "${value}"`);
  }
  return value as Currency;
}

/**
 * REST delivery for the Currency module. Validates channel/currency enums at
 * the boundary and maps domain errors (`RateNotFoundError` -> 404,
 * `InvalidMoneyError` -> 400) so the API never surfaces a bare 500 or a
 * swallowed 0/null for money paths. Rate reads are open to any authenticated
 * user; rate writes are `owner`/`admin`-only (backend-users-roles permission
 * matrix).
 */
@Controller('currency')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CurrencyController {
  constructor(private readonly currencyService: CurrencyService) {}

  @Post('rates')
  @HttpCode(HttpStatus.CREATED)
  @Roles(USER_ROLES.owner, USER_ROLES.admin)
  async createRate(@Body() body: CreateRateDto): Promise<RateResponseDto> {
    const channel = assertChannel(body.channel);
    return this.withDomainErrorMapping(() =>
      this.currencyService.createRate({ ...body, channel }),
    );
  }

  @Get('rates')
  async getLatestRate(
    @Query('channel') channel: string,
    @Query('at') at?: string,
  ): Promise<RateResponseDto> {
    const validChannel = assertChannel(channel);
    return this.withDomainErrorMapping(() =>
      this.currencyService.getLatestRate(validChannel, at),
    );
  }

  @Get('convert')
  async convert(
    @Query('amount') amount: string,
    @Query('from') from: string,
    @Query('channel') channel: string,
    @Query('to') to: string,
    @Query('at') at?: string,
  ): Promise<ConvertResponseDto> {
    const validFrom = assertCurrency(from);
    const validChannel = assertChannel(channel);
    const validTo = assertCurrency(to);
    return this.withDomainErrorMapping(() =>
      this.currencyService.convert({
        amount,
        from: validFrom,
        channel: validChannel,
        to: validTo,
        at,
      }),
    );
  }

  private async withDomainErrorMapping<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof RateNotFoundError) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof InvalidMoneyError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }
}
