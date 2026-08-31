import type { Config } from '@react-router/dev/config';

export default {
  // Server-rendered (design.md §1): every backend call is server-to-server
  // from a loader/action, never from the browser — this is RR7's DEFAULT
  // mode, stated explicitly because this template's sibling app
  // (`static-store`) overrides it to `ssr: false`. This app must NOT copy
  // that override.
  ssr: true,
  // Opt in early to the React Router v8 behavior changes so the dev server
  // stops printing the v8 future-flag warnings at startup. Each flag opts
  // into one v8 behavior; enabling them now avoids a breaking migration
  // later. They are compatible with React Router 7 (the package is the
  // v7 release on the path to v8).
  future: {
    v8_middleware: true,
    v8_splitRouteModules: true,
    v8_viteEnvironmentApi: true,
    v8_passThroughRequests: true,
    v8_trailingSlashAwareDataRequests: true,
  },
} satisfies Config;
