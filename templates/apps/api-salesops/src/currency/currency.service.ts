import { Inject, Injectable } from '@nestjs/common';
import type {
  Currency,
  ExchangeRate as DomainExchangeRate,
  ICurrencyRepository,
  PaymentChannel,
} from '@store-mgmt/domain';
import {
  CHANNEL_CURRENCY,
  CURRENCY_REPOSITORY,
  convertir,
  moneyFromDecimalString,
  moneyToDecimalString,
  rateFromDecimalString,
  rateToDecimalString,
  resolverTasa,
} from '@store-mgmt/domain';
import type { ConvertQueryDto, ConvertResponseDto, CreateRateDto, RateResponseDto } from './dto/index.js';

/** All five confirmed channels, derived from the domain's fixed map (no open string). */
const ALL_CHANNELS = Object.keys(CHANNEL_CURRENCY) as PaymentChannel[];

/**
 * Orchestration layer: the only place with both I/O (via `CURRENCY_REPOSITORY`)
 * and domain logic (`resolverTasa`/`convertir`). Maps the domain's `bigint`
 * `Money`/rate types to decimal strings for the API boundary.
 */
@Injectable()
export class CurrencyService {
  constructor(
    @Inject(CURRENCY_REPOSITORY) private readonly currencyRepository: ICurrencyRepository,
  ) {}

  async createRate(input: CreateRateDto): Promise<RateResponseDto> {
    const created = await this.currencyRepository.appendRate({
      channel: input.channel,
      rate: rateFromDecimalString(input.rate),
      effectiveFrom: new Date(input.effectiveFrom),
    });
    return this.toRateResponse(created);
  }

  async getLatestRate(channel: PaymentChannel, at?: string): Promise<RateResponseDto> {
    const atDate = at ? new Date(at) : new Date();
    const rates = await this.fetchAllRates(atDate);
    const resolved = resolverTasa(rates, channel, atDate);
    return {
      // `resolved.source.id` is absent only for resolver-fabricated synthetic
      // pivot rows (e.g. the USD identity rate) — never fabricate an id here.
      id: resolved.source.id ?? null,
      channel,
      rate: rateToDecimalString(resolved.rate),
      effectiveFrom: resolved.source.effectiveFrom.toISOString(),
    };
  }

  async convert(input: ConvertQueryDto): Promise<ConvertResponseDto> {
    const atDate = input.at ? new Date(input.at) : new Date();
    const origen = moneyFromDecimalString(input.amount, input.from);
    const rates = await this.fetchAllRates(atDate);
    const result = convertir(rates, origen, input.channel, input.to, atDate);
    return {
      amount: moneyToDecimalString(result.money),
      currency: result.money.currency as Currency,
      rateApplied: rateToDecimalString(result.rateApplied.rate),
      effectiveFrom: result.rateApplied.effectiveFrom.toISOString(),
    };
  }

  /**
   * `resolverTasa`/`convertir` need cross-channel rate history to resolve the
   * currency-fallback cascade (step 2), but the port only exposes
   * `ratesForChannel` for a single channel at a time. Since the channel set
   * is small and fixed (5 channels), fetch all of them and let the pure
   * domain function do the cascade — no repository change needed.
   */
  private async fetchAllRates(at: Date): Promise<DomainExchangeRate[]> {
    const perChannel = await Promise.all(
      ALL_CHANNELS.map((channel) => this.currencyRepository.ratesForChannel(channel, at)),
    );
    return perChannel.flat();
  }

  private toRateResponse(rate: DomainExchangeRate): RateResponseDto {
    // `createRate` always passes a just-persisted row, so `id` is always set
    // here in practice; the `?? null` guard keeps the mapping honest for any
    // future caller of this helper with a synthetic (unpersisted) row.
    return {
      id: rate.id ?? null,
      channel: rate.channel,
      rate: rateToDecimalString(rate.rate),
      effectiveFrom: rate.effectiveFrom.toISOString(),
    };
  }
}
