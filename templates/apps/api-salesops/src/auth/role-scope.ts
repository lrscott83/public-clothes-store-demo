import type { SanitizedUser } from '@store-mgmt/api-common';
import { RoleHelpers, USER_ROLES } from '@store-mgmt/domain';

/**
 * `true` only for a caller whose access comes SOLELY from `sales_agent` —
 * not from `owner`, `admin` or `sales_operator`.
 *
 * The distinction matters because scoping is about what a caller may SEE, and
 * an owner who also happens to hold the agent bit still supervises the whole
 * company. Scoping them to their own rows would hide their staff's sales from
 * them.
 *
 * Lives here, on its own, because two controllers now need it. Two copies of a
 * predicate that decides who can read whose earnings is exactly the kind of
 * duplication that drifts apart quietly.
 */
export function isScopedSalesAgent(user: SanitizedUser): boolean {
  return (
    RoleHelpers.hasRole(user.roles, USER_ROLES.sales_agent) &&
    !RoleHelpers.hasRole(user.roles, USER_ROLES.owner) &&
    !RoleHelpers.hasRole(user.roles, USER_ROLES.admin) &&
    !RoleHelpers.hasRole(user.roles, USER_ROLES.sales_operator)
  );
}
