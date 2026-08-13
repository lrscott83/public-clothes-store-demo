import { coverageConfigDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      exclude: [...coverageConfigDefaults.exclude, '**/index.ts'],
      thresholds: {
        statements: 89,
        branches: 94,
        functions: 90,
        lines: 89,
      },
    },
  },
});
