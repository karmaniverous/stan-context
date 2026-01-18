/** See <stanPath>/system/stan.project.md for global requirements. */
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(rootDir, 'src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    exclude: ['node_modules/**', 'dist/**', '.rollup.cache/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/test/**',
        '**/*.d.ts',
        'src/index.ts',
      ],
    },
    reporters: [
      [
        'default',
        {
          summary: false,
        },
      ],
    ],
    testTimeout: 15000,
    hookTimeout: 10000,
  },
});
