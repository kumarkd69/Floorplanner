import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  // The kernels under test are pure — they touch the DOM only inside functions
  // the suite never calls (canvas rendering, file downloads). Running in plain
  // Node keeps the suite fast and avoids depending on jsdom, whose bundled
  // undici breaks against some Node versions.
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
