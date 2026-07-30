/**
 * Request body for `POST /customers/with-identity` — the route that MINTS a
 * login for a walk-in customer instead of linking an existing one.
 *
 * Deliberately declares NEITHER `userId` NOR `roles`:
 *  - `userId` — this route mints the identity. Accepting one would recreate
 *    the link-to-an-arbitrary-existing-`User` power that `POST /customers`
 *    keeps away from a `sales_agent`: an agent could bind a customer record to
 *    the owner's identity.
 *  - `roles` — the created identity is ALWAYS the `user` bit. There is no
 *    parameter to override it and no code path that reads one.
 *
 * NOTE: this app installs NO global `ValidationPipe`, so this class is a
 * COMPILE-TIME contract only — at runtime it strips nothing and rejects
 * nothing, and the body arrives byte-for-byte as sent. The runtime guarantees
 * are the module-private role constant in `CustomerIdentityService` and the
 * hand-written boundary asserts in `CustomerIdentityController` (the house
 * pattern here, same as `assertCurrency`/`assertChannel`).
 */
export class CreateCustomerWithIdentityDto {
  fullName!: string;
  login!: string;
  password!: string;
  documentId?: string;
  cellPhone?: string;
  email?: string;
  address?: string;
  note?: string;
}
