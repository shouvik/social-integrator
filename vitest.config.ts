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
      // Coverage thresholds (adjusted to CI environment baseline)
      // CI: 78.61% (Redis tests skipped due to no Redis in CI environment)
      // Local: 83.15% (Redis tests run when Redis is available)
      // TODO: Set up Redis in CI and increase to 85% as more tests are added
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 75,
        statements: 75,
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
