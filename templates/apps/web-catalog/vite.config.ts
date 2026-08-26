import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  css: {
    // Tailwind 4 via `@tailwindcss/vite` needs no PostCSS config. Pin an
    // empty inline one so Vite does not walk up into this legacy repo's
    // root `postcss.config.js` (Tailwind 3 + autoprefixer, not installed
    // here) — mirrors `apps/static-store/vite.config.ts`'s identical fix.
    postcss: { plugins: [] },
  },
  server: {
    port: 3000,
    host: true,
    watch: {
      // Exclude the image storage directory from Vite's file watcher —
      // it lives at monorepo root (templates/.dev-storage) and contains
      // hundreds of binary files that cause CPU spikes on file-system
      // events (Explorer navigation, git operations, etc.).
      ignored: ['**/.dev-storage/**', '**/storage/**'],
    },
  },
  preview: {
    port: 3000,
    host: true,
  },
  resolve: {
    // Force a single copy of React and React Router — mirrors
    // `static-store/vite.config.ts`. Without dedupe, a workspace package
    // that declares its own react/react-router deps can resolve a second
    // copy, producing "Cannot read properties of null (reading
    // 'useContext')" during render.
    dedupe: ['react', 'react-dom', 'react-router'],
    alias: {
      // This template lives nested inside a legacy repo whose root
      // `node_modules` contains `react-router-dom@6`. Vite's dev
      // dep-scanner otherwise resolves a phantom `react-router-dom` up into
      // that root copy, whose v6 internals import `UNSAFE_*` symbols that
      // don't exist in react-router@7 and crash dev startup (spike 0.1b:
      // `pnpm dev` failed with "No matching export ... UNSAFE_useRouteId"
      // before this alias was added). Nothing here imports
      // `react-router-dom`; alias any such resolution to the local
      // react-router@7 so it never escapes upward.
      'react-router-dom': 'react-router',
    },
  },
});
