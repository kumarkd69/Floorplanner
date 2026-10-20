// Boot: shared chrome on every page, then the scroll scenes for this page.
import { env } from './lib/env.js';
import { initMotion } from './lib/motion.js';
import { mountMedia } from './lib/media.js';
import { initHeader } from './components/header.js';
import { initWhatsApp } from './components/whatsapp.js';
import { initCursor } from './components/cursor.js';
import { initFooter } from './components/footer.js';
import { rebuildVideoText } from './components/videotext.js';
import { initHero, resizeHero } from './scenes/hero.js';
import { initOoru } from './scenes/ooru.js';

let contexts = [];
const scenes = () => {
  contexts = [initHero(), initOoru(), initFooter()].filter(Boolean);
};

async function boot() {
  // CDN libraries failed: keep the static, fully readable page.
  if (!env.libs) document.documentElement.classList.remove('js-motion');

  initHeader();
  initWhatsApp();
  mountMedia();

  if (env.libs) initMotion();
  // Split lines only once the display fonts have their real metrics.
  await document.fonts.ready;
  scenes();
  if (!env.libs) return;
  initCursor();
  window.ScrollTrigger.refresh();

  let width = window.innerWidth, timer;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (window.innerWidth === width) return;
      width = window.innerWidth;
      contexts.forEach((c) => c.revert());
      resizeHero();
      scenes();
      rebuildVideoText();
      window.ScrollTrigger.refresh();
    }, 250);
  });
}

boot();
