import { Prisma } from '../../generated/tenant/client.js';

/**
 * Normalizes every place the violated column/constraint can surface into one
 * lowercase haystack, so a match does not depend on which shape this Prisma
 * version populates.
 *
 * With the driver-adapter (`@prisma/adapter-pg`) + WASM query compiler
 * architecture, the classic `err.meta.target` is EMPTY. The real information
 * lives under `meta.driverAdapterError.cause.constraint` — `fields:
 * ['order_id']` for a P2002, `index: 'delivery_assignment_order_id_fkey'` for
 * a P2003 (verified empirically against this repo's own tenant schema). Both
 * the classic and the driver-adapter shapes are read, same defensive
 * discipline as `prisma-customer.repository.ts`'s `isUniqueViolation`.
 *
 * Lives in its own file because BOTH Delivery constraint translators need it
 * and it was near-verbatim duplicated between them — two copies of the
 * parser that decides WHICH constraint was violated is exactly the kind of
 * duplication that drifts apart quietly (`../auth/role-scope.ts` exists for
 * the same reason on the app side).
 */
export function describeConstraintTarget(err: Prisma.PrismaClientKnownRequestError): string {
  const meta = (err.meta ?? {}) as {
    target?: unknown;
    field_name?: unknown;
    driverAdapterError?: { cause?: { constraint?: { fields?: unknown; index?: unknown } } };
  };
  const constraint = meta.driverAdapterError?.cause?.constraint;
  return [meta.target, meta.field_name, constraint?.fields, constraint?.index]
    .flat()
    .filter((part): part is string => typeof part === 'string')
    .join(' ')
    .toLowerCase();
}

/**
 * `true` when the violated constraint is (or is part of) `name`.
 *
 * Matched on the WHOLE constraint/index name, never on a column substring.
 * The coverage translator used to ask `target.includes('warehouse_id')`
 * BEFORE `target.includes('carrier_id')`, which happens to disambiguate
 * `carrier_warehouse`'s two FKs today only by accident of how Prisma named
 * them (`carrier_warehouse_carrier_id_fkey` does not contain the substring
 * `warehouse_id`, and `carrier_warehouse_warehouse_id_fkey` does not contain
 * `carrier_id`). Rename either constraint and the two branches silently swap
 * meanings. Naming the constraint outright removes the ordering dependency
 * altogether.
 */
export function violatedConstraintIs(
  err: Prisma.PrismaClientKnownRequestError,
  name: string,
): boolean {
  const target = describeConstraintTarget(err);
  return target.includes(name.toLowerCase());
}

/** `true` when EVERY listed column name appears in the violated constraint's description. */
export function violatedConstraintCovers(
  err: Prisma.PrismaClientKnownRequestError,
  columns: readonly string[],
): boolean {
  const target = describeConstraintTarget(err);
  return columns.every((column) => target.includes(column.toLowerCase()));
}
