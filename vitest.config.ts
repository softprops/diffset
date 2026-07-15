import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'lcov'],
      thresholds: {
        statements: 98,
        branches: 91,
        functions: 98,
        lines: 98,
      },
    },
    include: ['__tests__/**/*.ts'],
  },
});
