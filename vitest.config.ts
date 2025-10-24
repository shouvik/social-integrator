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
      // Critical coverage thresholds (85% minimum)
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
