import { coverageConfigDefaults, defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['app/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      // Extend (not replace) vitest's default excludes — otherwise compiled
      // output ends up scanned as "0%-covered source" (build/client/assets/*.js
      // and the generated .react-router/ typegen output are not real source).
      exclude: [...coverageConfigDefaults.exclude, 'build/**', '.react-router/**'],
    },
  },
});
