import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  // jsdom gives the export modules a DOM to touch at import time; the geometry
  // and unit suites are environment-agnostic.
  test: { environment: 'jsdom', include: ['src/**/*.test.ts'] },
});
