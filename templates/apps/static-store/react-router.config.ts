import type { Config } from '@react-router/dev/config';

export default {
  // Client-only SPA, matching the shared stack. No server runtime needed.
  ssr: false,
  // Prerender static HTML for the known routes so the build output can be
  // served from any static host (e.g. GitHub Pages). Product detail resolves
  // client-side against the catalog provider by `:id`, so it is intentionally
  // NOT prerendered (see app/routes/product-detail.tsx).
  prerender: ['/', '/productos'],
} satisfies Config;
