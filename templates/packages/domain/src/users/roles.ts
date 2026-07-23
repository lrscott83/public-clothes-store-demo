/**
 * Roles bitmask — pure, framework-free. Mirrors the poolops-biz
 * `RoleHelpers` convention (`hasRole = (roles & bit) === bit`).
 */
export const USER_ROLES = {
  user: 1, // 0b00001 — buyer / base
  warehouse_operator: 2, // 0b00010
  sales_operator: 4, // 0b00100
  owner: 8, // 0b01000 — full business power
  admin: 16, // 0b10000 — system super-root
} as const;

export type UserRoleName = keyof typeof USER_ROLES;
export type UserRoleValue = number; // stored bitmask

const BUSINESS_ROLES_MASK =
  USER_ROLES.user | USER_ROLES.warehouse_operator | USER_ROLES.sales_operator | USER_ROLES.owner;

const ALL_ROLES_MASK = BUSINESS_ROLES_MASK | USER_ROLES.admin;

/**
 * Spanish, UI-facing display labels for each role KEY. Keys stay in English
 * (code/DB identifiers); only the human-readable label is Spanish.
 */
const ROLE_LABELS_ES: Record<UserRoleName, string> = {
  user: 'Cliente',
  warehouse_operator: 'Operador de almacén',
  sales_operator: 'Operador de gestores',
  owner: 'Dueño',
  admin: 'Administrador',
};

export const RoleHelpers = {
  /** Check if `roles` holds `bit`. */
  hasRole: (roles: UserRoleValue, bit: UserRoleValue): boolean => (roles & bit) === bit,

  /** Add `bit` to `roles`, keeping every other bit held. */
  addRole: (roles: UserRoleValue, bit: UserRoleValue): UserRoleValue => roles | bit,

  /** Clear only `bit` from `roles`; every other bit stays held. */
  removeRole: (roles: UserRoleValue, bit: UserRoleValue): UserRoleValue => roles & ~bit,

  /** Decompose `roles` into the individual single bits it holds. */
  getRoles: (roles: UserRoleValue): UserRoleValue[] =>
    Object.values(USER_ROLES).filter((bit) => (roles & bit) === bit),

  /** Spanish display label for a single role name — UI-facing only, never a stored/matched key. */
  getRoleLabel: (name: UserRoleName): string => ROLE_LABELS_ES[name],

  /** Spanish display labels for every role bit held by `roles`, for DTOs/UI. */
  getRoleLabels: (roles: UserRoleValue): string[] =>
    (Object.keys(USER_ROLES) as UserRoleName[])
      .filter((name) => (roles & USER_ROLES[name]) === USER_ROLES[name])
      .map((name) => ROLE_LABELS_ES[name]),
};

/**
 * Resolves the EFFECTIVE permission mask for `roles`:
 * - `admin` held → union of ALL bits (system super-root).
 * - else `owner` held → union of all BUSINESS bits (not `admin`) — "full
 *   business power" per the locked model.
 * - else → `roles` unchanged.
 */
export function effectiveRoles(roles: UserRoleValue): UserRoleValue {
  if (RoleHelpers.hasRole(roles, USER_ROLES.admin)) {
    return ALL_ROLES_MASK;
  }
  if (RoleHelpers.hasRole(roles, USER_ROLES.owner)) {
    return BUSINESS_ROLES_MASK;
  }
  return roles;
}

/**
 * Authz predicate: does `roles` grant access to ANY bit in `requiredMask`?
 * UNION semantics — holding any one of the required roles is enough.
 */
export function can(roles: UserRoleValue, requiredMask: UserRoleValue): boolean {
  return (effectiveRoles(roles) & requiredMask) !== 0;
}
