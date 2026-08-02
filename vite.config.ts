import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  // Relative asset URLs, so a built bundle works when served from a
  // subdirectory (GitHub Pages project sites, S3 prefixes, a docs/ folder)
  // and not only from a domain root.
  base: './',
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
  build: { target: 'es2020', sourcemap: true },
});
