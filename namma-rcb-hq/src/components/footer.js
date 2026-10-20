// Footer closing line: ONE TEAM. / ONE CITY. / ONE ARMY. lock in one by one.
import { env } from '../lib/env.js';
import { maskSplit } from '../lib/split.js';

export function initFooter() {
  const block = document.querySelector('[data-lock]');
  if (!block || !env.motion) return null;
  const { gsap } = window;
  return gsap.context(() => {
    const splits = [...block.children].map((el) => maskSplit(el));
    splits.forEach((s, i) => {
      gsap.set(s.chars, { yPercent: 110 });
      gsap.to(s.chars, {
        yPercent: 0,
        duration: 0.8,
        stagger: 0.02,
        ease: 'power4.out',
        scrollTrigger: { trigger: block.children[i], start: 'top 88%', once: true },
      });
    });
    return () => splits.forEach((s) => s.revert());
  }, block);
}
