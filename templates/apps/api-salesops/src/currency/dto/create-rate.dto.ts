import type { PaymentChannel } from '@store-mgmt/domain';

/**
 * Request body for `POST /currency/rates`. Every money/rate field is a
 * `string` — never a JSON number — so decimal fidelity is preserved from the
 * wire through to the domain's `bigint` minor units.
 */
export class CreateRateDto {
  channel!: PaymentChannel;
  rate!: string;
  effectiveFrom!: string;
}
