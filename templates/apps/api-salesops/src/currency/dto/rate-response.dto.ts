import type { PaymentChannel } from '@store-mgmt/domain';

/**
 * Response shape for `POST /currency/rates` and `GET /currency/rates`.
 * `rate` is always a decimal string (e.g. `"350.455000"`), never a number.
 *
 * `id` is the persisted `exchange_rate` row's UUID — present (non-null) for
 * `POST /currency/rates` (always a fresh insert) and for `GET /currency/rates`
 * when the resolved rate came from a real persisted row. It is `null` only
 * when `GET /currency/rates` resolves to a synthetic pivot row fabricated by
 * `resolveRate`'s currency-fallback cascade (e.g. the USD identity rate,
 * which was never persisted). Never a fabricated/fake UUID.
 */
export class RateResponseDto {
  id!: string | null;
  channel!: PaymentChannel;
  rate!: string;
  effectiveFrom!: string;
}
