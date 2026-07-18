// Shared rule: enforce the backend architecture boundaries for store-mgmt.
// - `@store-mgmt/domain` must never import from infra-* packages or apps.
// - Web apps (salesops-mvp, static-store) must never import backend-only
//   packages (`@store-mgmt/infra-db`, `@store-mgmt/api-salesops`).
// Usage: consumers spread `domainBoundaryRule` or `webBackendBoundaryRule`
// into their own flat ESLint config.

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
        ],
      },
    ],
  },
};
