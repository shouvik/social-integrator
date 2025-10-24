import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        'scripts/',
        'examples/',
        '**/*.d.ts',
        '**/*.config.ts',
        '**/types.ts',
      ],
      // Coverage thresholds (adjusted to current baseline)
      // TODO: Increase to 85% as more tests are added for TwitterConnector, RSSConnector, GoogleConnector
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
      // Include critical paths
      include: [
        'src/core/**/*.ts',
        'src/connectors/**/*.ts',
        'src/observability/**/*.ts',
        'src/config/**/*.ts',
        'src/utils/**/*.ts',
      ],
    },
  },
});
