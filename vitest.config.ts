import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Set NODE_ENV to test to prevent server from starting during tests
process.env.NODE_ENV = 'test';

const sharedExclude = [
  'node_modules/**',
  'dist/**',
  'e2e/**',
  'ml-service/**',
  'tests/integration/**',
];

const sharedResolve = {
  alias: {
    '@': path.resolve(__dirname, './src'),
    '@core': path.resolve(__dirname, './src/core'),
    '@server': path.resolve(__dirname, './src/server'),
    '@client': path.resolve(__dirname, './src/client'),
    '@db': path.resolve(__dirname, './src/db'),
    '@types': path.resolve(__dirname, './src/types'),
  },
};

export default defineConfig({
  plugins: [vue()],
  resolve: sharedResolve,
  test: {
    globals: true,
    exclude: sharedExclude,
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
    // vitest 4 replaces environmentMatchGlobs with projects
    projects: [
      {
        plugins: [vue()],
        resolve: sharedResolve,
        test: {
          name: 'client',
          environment: 'jsdom',
          include: ['src/client/**/*.spec.ts'],
          exclude: sharedExclude,
          setupFiles: ['./src/test-setup.ts'],
          globals: true,
        },
      },
      {
        resolve: sharedResolve,
        test: {
          name: 'server',
          environment: 'node',
          include: [
            'src/core/**/*.spec.ts',
            'src/server/**/*.spec.ts',
            'src/db/**/*.spec.ts',
            'tests/**/*.ts',
          ],
          exclude: sharedExclude,
          setupFiles: ['./src/test-setup.ts'],
          globals: true,
        },
      },
    ],
  },
});
