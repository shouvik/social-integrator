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
      // Coverage thresholds (target: 85%)
      // Updated after comprehensive test coverage improvements
      // All metrics now meet or exceed 85% threshold
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
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
