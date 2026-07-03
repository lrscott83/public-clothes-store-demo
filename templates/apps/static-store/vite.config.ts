import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

// Base subpath the app is served under (e.g. GitHub Pages project pages
// require `/<repo>/`). Defaults to `/` for local dev and user/org Pages.
// MUST match `basename` in `react-router.config.ts` (see that file) so
// client-side routing and prerendered links stay consistent with the
// asset base Vite emits into the built HTML.
const base = process.env.VITE_BASE || '/';

export default defineConfig({
  base,
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  server: {
    port: 3344,
    host: 'localhost',
  },
  preview: {
    port: 3344,
    host: 'localhost',
  },
  resolve: {
    // Force a single copy of React and React Router. web-common declares its
    // own react/react-dom/react-router deps; without dedupe pnpm resolves them
    // as separate instances, producing "Cannot read properties of null
    // (reading 'useContext')" during client render.
    dedupe: ['react', 'react-dom', 'react-router'],
    alias: {
      // This template lives nested inside a legacy repo whose root node_modules
      // contains react-router-dom@6. Vite's dev dep-scanner otherwise resolves
      // a phantom `react-router-dom` up into that root copy, whose v6 internals
      // import `UNSAFE_*` symbols that don't exist in react-router@7 and crash
      // dev startup. Nothing here imports react-router-dom; alias any such
      // resolution to the local react-router@7 so it never escapes upward.
      'react-router-dom': 'react-router',
    },
  },
  optimizeDeps: {
    // @store-mgmt/storefront exposes only subpath exports (no "." root entry),
    // so include the subpaths the app imports — listing the bare package here
    // makes Vite's dep optimizer fail dev with "Missing '.' specifier".
    include: [
      '@store-mgmt/storefront/theme',
      '@store-mgmt/storefront/catalog',
      '@store-mgmt/storefront/config',
    ],
  },
});
