import type { Config } from '@react-router/dev/config';

export default {
  // Client-only SPA, matching the shared stack. No server runtime needed.
  ssr: false,
  // Prerender static HTML for the known routes so the build output can be
  // served from any static host (e.g. GitHub Pages).
  prerender: ['/'],
} satisfies Config;
