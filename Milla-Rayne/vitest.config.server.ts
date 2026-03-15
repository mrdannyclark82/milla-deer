import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client', 'src'),
      '@assets': path.resolve(__dirname, 'attached_assets'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    env: {
      GEMINI_API_KEY: 'mock-gemini-key',
      MEMORY_KEY: 'test-key-012345678901234567890123456789012',
    },
    include: ['server/**/*.test.ts', 'server/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['server/**/*.ts'],
      exclude: [
        'server/__tests__/**',
        'server/**/*.test.ts',
        'server/**/*.spec.ts',
        'server/index.ts',
        'server/db/**',
        '**/*.d.ts',
        'node_modules/**',
        'dist/**',
      ],
      all: true,
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80,
    },
  },
};
