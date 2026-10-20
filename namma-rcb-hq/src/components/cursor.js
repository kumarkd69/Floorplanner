// Desktop pointer only: a 12 px ring that grows over media with a PLAY / DRAG
// label, and the magnetic JOIN THE ARMY button (60 px pull radius).
import { env } from '../lib/env.js';

export function initCursor() {
  if (!env.finePointer || !env.motion || env.mobile) return;
  const { gsap } = window;

  const el = document.createElement('div');
  el.className = 'cursor is-hidden';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<span class="cursor__label"></span>';
  document.body.appendChild(el);
  document.documentElement.classList.add('has-cursor');
  const label = el.firstChild;
  const x = gsap.quickTo(el, 'x', { duration: 0.18, ease: 'power3' });
  const y = gsap.quickTo(el, 'y', { duration: 0.18, ease: 'power3' });

  const magnets = [...document.querySelectorAll('[data-magnetic]')].map((m) => ({
    m,
    x: gsap.quickTo(m, 'x', { duration: 0.5, ease: 'elastic.out(1, .5)' }),
    y: gsap.quickTo(m, 'y', { duration: 0.5, ease: 'elastic.out(1, .5)' }),
  }));

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    el.classList.remove('is-hidden');
    x(e.clientX);
    y(e.clientY);
    const hit = e.target.closest?.('[data-cursor]');
    el.classList.toggle('is-media', Boolean(hit));
    if (hit) label.textContent = hit.dataset.cursor.toUpperCase();

    for (const g of magnets) {
      const r = g.m.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const reach = Math.max(r.width, r.height) / 2 + 60;
      const near = Math.hypot(dx, dy) < reach;
      g.x(near ? dx * 0.35 : 0);
      g.y(near ? dy * 0.35 : 0);
    }
  }, { passive: true });
  document.addEventListener('pointerleave', () => el.classList.add('is-hidden'));
}
