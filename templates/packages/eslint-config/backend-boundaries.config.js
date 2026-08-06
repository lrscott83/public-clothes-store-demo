// Shared rule: enforce the backend architecture boundaries for store-mgmt.
// - `@store-mgmt/domain` must never import from infra-* packages or apps.
// - Web apps (salesops-mvp, static-store) must never import backend-only
//   packages (`@store-mgmt/infra-db`, `@store-mgmt/api-salesops`,
//   `@store-mgmt/api-common`).
// - Tenant-side `infra-db` repositories must never import the master Prisma
//   client (multi-tenant-by-schema, task 14.1 — enforces what task 6.4
//   verified by hand).
// Usage: consumers spread `domainBoundaryRule`, `webBackendBoundaryRule`, or
// `tenantRepoBoundaryRule` into their own flat ESLint config.

/** @type {import("eslint").Linter.Config} */
export const domainBoundaryRule = {
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@store-mgmt/infra-*", "@store-mgmt/infra-*/*"],
            message:
              "@store-mgmt/domain is a pure domain package. It must not import infra-* packages — dependency direction is apps -> infra-db -> domain.",
          },
          {
            group: ["@store-mgmt/api-*", "@store-mgmt/api-*/*"],
            message:
              "@store-mgmt/domain is a pure domain package. It must not import apps.",
          },
        ],
      },
    ],
  },
};

/** @type {import("eslint").Linter.Config} */
export const webBackendBoundaryRule = {
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@store-mgmt/infra-db", "@store-mgmt/infra-db/*"],
            message:
              "Backend-only package. Web apps must not import @store-mgmt/infra-db.",
          },
          {
            group: ["@store-mgmt/api-salesops", "@store-mgmt/api-salesops/*"],
            message:
              "Backend-only package. Web apps must not import @store-mgmt/api-salesops.",
          },
          {
            group: ["@store-mgmt/api-common", "@store-mgmt/api-common/*"],
            message:
              "Backend-only package. Web apps must not import @store-mgmt/api-common.",
          },
        ],
      },
    ],
  },
};

// Design.md §3's file map names these files by exact glob:
// `src/{currency,customer,sales,commission,inventory,product,users/warehouse-operator}/prisma-*.repository.ts`
// — the ~12 tenant-side repository ADAPTERS (design D2/D5) Phase 6
// re-sourced onto `TenantContextService.getClient()`. Deliberately narrower
// than "every file under these directories": `product/copy-catalog.ts` and
// `product/seed.ts` (`seedTemplateCatalog`), for example, sit in the same
// directories but LEGITIMATELY read the master template catalog to copy it
// into a tenant — they are provisioning/seed primitives, not tenant
// repositories, and this rule must not fire on them.
//
// Applied to `packages/infra-db`'s own `eslint.config.mjs` (`files` globs
// are relative to the linted package's root, per ESLint flat-config
// convention) — meaningless in any other package, since none of them have
// this directory shape.
/** @type {import("eslint").Linter.Config} */
export const tenantRepoBoundaryRule = {
  files: [
    "src/currency/prisma-*.repository.ts",
    "src/customer/prisma-*.repository.ts",
    "src/sales/prisma-*.repository.ts",
    "src/commission/prisma-*.repository.ts",
    "src/inventory/prisma-*.repository.ts",
    "src/product/prisma-*.repository.ts",
    "src/users/prisma-warehouse-operator.repository.ts",
    "src/delivery/prisma-*.repository.ts",
  ],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["**/master-prisma-client.js", "**/master-prisma-client"],
            message:
              "Tenant-side repositories must resolve their Prisma client via TenantContextService.getClient() (design.md D2/D5), never the master PrismaMasterService — importing it here would silently bind a tenant repo to the wrong schema.",
          },
        ],
      },
    ],
  },
};
