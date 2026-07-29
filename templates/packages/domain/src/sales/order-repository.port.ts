import type { Order, OrderStatus } from './order.js';

/** Optional filter for `IOrderRepository.list`. */
export interface OrderListFilter {
  readonly customerId?: string;
  readonly status?: OrderStatus;
}

/** Partial update payload — `id`/`createdAt` are immutable once persisted. */
export type OrderUpdateInput = Partial<Omit<Order, 'id' | 'createdAt'>>;

/**
 * Port for reading/writing the `Order` aggregate. Zero dependency on any
 * persistence technology — domain and application code import this
 * interface, never a concrete Prisma class. `create` persists an already
 * factory-validated aggregate (`createOrder` output) in one round-trip;
 * `confirm`/`deliver`/`cancel` are the THREE atomic status transitions
 * (design decision #8) — each wraps its own guard + stock-bridge side
 * effect (reserve/consume+release/release) in a single transaction at the
 * infra layer. An Order is an immutable transactional event — there is NO
 * delete (not even soft-delete): its lifecycle is expressed ONLY through the
 * status machine (created/verified/delivered/cancelled). Mirrors the
 * append-only `StockMovement`/`ExchangeRate` records.
 */
export interface IOrderRepository {
  /**
   * Takes the BUILT aggregate, not `CreateOrderInput`. It was typed as the
   * latter, which is why the Prisma adapter had to open with
   * `input as unknown as Order` — every caller has always passed `createOrder`
   * output, and the doc comment above already said so. Attribution made the
   * mismatch a compile error (`Order` allows `null` there, `CreateOrderInput`
   * does not), so the signature now states what the contract always was.
   */
  create(order: Order): Promise<Order>;
  update(id: string, patch: OrderUpdateInput): Promise<Order>;
  findById(id: string): Promise<Order | null>;
  list(filter?: OrderListFilter): Promise<Order[]>;
  /** `created -> verified`: freezes rate+totals AND reserves stock per line. */
  confirm(id: string): Promise<Order>;
  /** `verified -> delivered`: releases the reservation THEN consumes stock (`sale_out`) per line. */
  deliver(id: string): Promise<Order>;
  /** `created|verified -> cancelled`: releases the reservation per line when source is `verified`; no-op when source is `created`. */
  cancel(id: string): Promise<Order>;
}

/** DI token for `IOrderRepository` — consumers inject by this symbol. */
export const ORDER_REPOSITORY = Symbol('IOrderRepository');
