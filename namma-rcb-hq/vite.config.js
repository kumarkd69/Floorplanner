import { defineConfig } from 'vite';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, basename, relative, sep } from 'node:path';
import { config, waAdminLink } from './src/config.js';

const root = __dirname;
const assetsDir = resolve(root, 'public/assets');
const pages = ['index', 'about', 'events', 'gallery', 'contact'];

function listAssets(dir = assetsDir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) return listAssets(full);
    if (name.startsWith('.')) return [];
    return [relative(assetsDir, full).split(sep).join('/')];
  });
}

const lookup = (path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), config);

/**
 * HTML partials + config templating, and a virtual manifest of which files
 * exist in /public/assets so the client never requests a missing asset
 * (it generates a graded placeholder instead).
 */
function site() {
  const VIRTUAL = 'virtual:assets';
  return {
    name: 'namma-site',
    resolveId(id) {
      if (id === VIRTUAL) return '\0' + VIRTUAL;
    },
    load(id) {
      if (id === '\0' + VIRTUAL) return `export default new Set(${JSON.stringify(listAssets())});`;
    },
    configureServer(server) {
      server.watcher.add(assetsDir);
      const refresh = (file) => {
        if (!file.startsWith(assetsDir)) return;
        const mod = server.moduleGraph.getModuleById('\0' + VIRTUAL);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', refresh);
      server.watcher.on('unlink', refresh);
    },
    transformIndexHtml(html, ctx) {
      const page = basename(ctx.filename, '.html');
      for (let i = 0; i < 3; i++) {
        html = html.replace(/<!--\s*@include (\w+)\s*-->/g, (_, name) =>
          readFileSync(resolve(root, `src/partials/${name}.html`), 'utf8'));
      }
      const assets = listAssets();
      return html
        .replace(/\{\{waAdmin\}\}/g, waAdminLink())
        .replace(/\{\{poster:([\w-]+)\}\}/g, (_, name) =>
          assets.includes(`img/posters/${name}.webp`)
            ? `style="background-image:url(assets/img/posters/${name}.webp)"`
            : '')
        .replace(/\{\{([\w.]+)\}\}/g, (_, key) => String(lookup(key) ?? ''))
        .replace(new RegExp(`data-nav="${page}"`, 'g'), `data-nav="${page}" aria-current="page"`);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [site()],
  build: {
    rollupOptions: {
      input: Object.fromEntries(pages.map((p) => [p, resolve(root, `${p}.html`)])),
    },
  },
});
