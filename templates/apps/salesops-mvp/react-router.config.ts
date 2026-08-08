import type { Config } from '@react-router/dev/config';

// MUST match Vite's `base` in `vite.config.ts` — both read the same
// `VITE_BASE` env var so the asset base Vite emits and the client-side
// router basename stay in sync under a GitHub Pages project-page subpath
// (e.g. `/repo-name/`). Defaults to `/` for local dev and user/org Pages.
const basename = process.env.VITE_BASE || '/';

export default {
  // Client-only SPA, matching the shared stack. No server runtime needed.
  ssr: false,
  // Prerender the root so the build output can be served from any static
  // host (e.g. GitHub Pages) with a working landing page. Every other screen
  // is behind the always-visible sidebar shell and resolves client-side.
  prerender: ['/'],
  basename,
  // Opt in early to the React Router v8 behaviors. This is a greenfield
  // template with no legacy behavior to preserve, so adopting them keeps the
  // app aligned with v8 and silences the framework's Future Flag warnings.
  //
  // NOTE: `v8_viteEnvironmentApi` is intentionally NOT enabled. Turning it on
  // makes Vite's dev server load a second React instance for the linked
  // workspace packages, so react-router's <Meta> hits a null hook dispatcher
  // ("Cannot read properties of null (reading 'useContext')") on client
  // render. The remaining flags don't touch module/dep optimization and are
  // safe. Its one Future Flag warning is harmless; revisit once the
  // Environment API integration stabilizes.
  future: {
    v8_middleware: true,
    v8_splitRouteModules: true,
    v8_passThroughRequests: true,
    v8_trailingSlashAwareDataRequests: true,
  },
} satisfies Config;
