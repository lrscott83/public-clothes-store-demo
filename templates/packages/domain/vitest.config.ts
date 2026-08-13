import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      thresholds: {
        statements: 84,
        branches: 91,
        functions: 85,
        lines: 84,
      },
    },
  },
});
