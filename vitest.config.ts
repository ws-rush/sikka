import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      thresholds: {
        lines: 91,
        functions: 93,
        branches: 81,
        statements: 89,
      },
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/types.ts'],
    },
  },
});
