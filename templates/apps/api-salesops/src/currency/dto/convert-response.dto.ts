import type { Currency } from '@store-mgmt/domain';

/** Response shape for `GET /currency/convert`. `amount`/`rateApplied` are decimal strings. */
export class ConvertResponseDto {
  amount!: string;
  currency!: Currency;
  rateApplied!: string;
  effectiveFrom!: string;
}
