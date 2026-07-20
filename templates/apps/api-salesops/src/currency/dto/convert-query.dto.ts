import type { Currency, PaymentChannel } from '@store-mgmt/domain';

/** Query parameters for `GET /currency/convert`. Every field arrives as a string. */
export class ConvertQueryDto {
  amount!: string;
  from!: Currency;
  channel!: PaymentChannel;
  to!: Currency;
  at?: string;
}
