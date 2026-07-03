import type { Config } from '@react-router/dev/config';

// MUST match Vite's `base` in `vite.config.ts` — both read the same
// `VITE_BASE` env var so the asset base Vite emits and the client-side
// router basename stay in sync under a GitHub Pages project-page subpath
// (e.g. `/repo-name/`). Defaults to `/` for local dev and user/org Pages.
const basename = process.env.VITE_BASE || '/';

export default {
  // Client-only SPA, matching the shared stack. No server runtime needed.
  ssr: false,
  // Prerender static HTML for the known routes so the build output can be
  // served from any static host (e.g. GitHub Pages). Product detail resolves
  // client-side against the catalog provider by `:id`, so it is intentionally
  // NOT prerendered (see app/routes/product-detail.tsx).
  prerender: ['/', '/productos'],
  basename,
  // Opt in early to the React Router v8 behaviors. This is a greenfield
  // template with no legacy behavior to preserve, so adopting them now keeps
  // the app aligned with v8 and silences the framework's Future Flag warnings.
  future: {
    v8_middleware: true,
    v8_splitRouteModules: true,
    v8_viteEnvironmentApi: true,
    v8_passThroughRequests: true,
    v8_trailingSlashAwareDataRequests: true,
  },
} satisfies Config;
