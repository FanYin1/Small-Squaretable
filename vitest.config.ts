import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Set NODE_ENV to test to prevent server from starting during tests
process.env.NODE_ENV = 'test';

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'jsdom',
    exclude: [
      'node_modules/**',
      'dist/**',
      'e2e/**',
    ],
    environmentMatchGlobs: [
      // Server-side tests should run in Node environment
      ['src/core/**/*.spec.ts', 'node'],
      ['src/server/**/*.spec.ts', 'node'],
      ['src/db/**/*.spec.ts', 'node'],
      ['tests/**/*.ts', 'node'],
    ],
    setupFiles: ['./src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'e2e/',
        '**/*.spec.ts',
        '**/*.test.ts',
        '**/types/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, './src/core'),
      '@server': path.resolve(__dirname, './src/server'),
      '@client': path.resolve(__dirname, './src/client'),
      '@db': path.resolve(__dirname, './src/db'),
      '@types': path.resolve(__dirname, './src/types'),
    },
  },
});
