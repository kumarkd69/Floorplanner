// Floating WhatsApp button + bottom sheet. Any [data-wa-open] opens it; without
// JS those links go straight to the community invite.
import { stopScroll, startScroll } from '../lib/motion.js';

export function initWhatsApp() {
  const sheet = document.getElementById('wa-sheet');
  if (!sheet || typeof sheet.showModal !== 'function') return;

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-wa-open]');
    if (!trigger) return;
    e.preventDefault();
    const menu = document.querySelector('[data-menu]');
    if (menu && !menu.hidden) document.querySelector('[data-menu-btn]')?.click();
    sheet.showModal();
    stopScroll();
  });
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet || e.target.closest('[data-wa-close]')) sheet.close();
  });
  sheet.addEventListener('close', startScroll);
}
