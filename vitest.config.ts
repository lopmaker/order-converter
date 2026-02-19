import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitest.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true, // so we don't have to import describe, it, expect, etc.
    setupFiles: './vitest.setup.ts', // optional setup file
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
