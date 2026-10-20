// Fixed header: turns solid after the first screen; mobile menu overlay.
import { stopScroll, startScroll } from '../lib/motion.js';

export function initHeader() {
  const header = document.querySelector('[data-header]');
  const btn = document.querySelector('[data-menu-btn]');
  const menu = document.querySelector('[data-menu]');
  if (!header) return;

  const solid = () => header.classList.toggle('is-solid', window.scrollY > 40);
  solid();
  window.addEventListener('scroll', solid, { passive: true });

  if (!btn || !menu) return;
  const setOpen = (open) => {
    btn.setAttribute('aria-expanded', String(open));
    btn.querySelector('.sr-only').textContent = open ? 'Close menu' : 'Menu';
    menu.hidden = !open;
    header.classList.toggle('is-solid', open || window.scrollY > 40);
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) { stopScroll(); menu.querySelector('a')?.focus(); }
    else startScroll();
  };
  btn.addEventListener('click', () => setOpen(menu.hidden));
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) { setOpen(false); btn.focus(); }
  });
  window.matchMedia('(min-width: 900px)').addEventListener('change', (e) => e.matches && !menu.hidden && setOpen(false));
}
