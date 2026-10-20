/**
 * CH.00 — Hero. Pinned for +=250% (+=150% on mobile), scrub 0.5.
 * Timeline runs 0..100 so positions read as scroll %.
 *
 *  at rest  Crest (0.8), "EVERY CITY HAS A HEARTBEAT." and JOIN THE ARMY are
 *           already on screen. The pulse line draws across on load.
 *   0–15%   Black. The pulse spikes and glows; the scroll cue fades.
 *  15–45%   Flag frames 1–80. Tunnel video fades up to 40%.
 *           Line 1 exits up; "OURS SOUNDS DIFFERENT." rises in.
 *  45–75%   Frames 81–160. Crest 0.8 → 1 with a gold glint sweep.
 *           "THIS ISN'T A FAN CLUB." then "THIS IS AN ARMY." rise as masked chars.
 *  75–100%  CTA copy fades in; pin releases; Ch.01 clip-reveals (ooru.js).
 *
 * Reduced motion / low power: no pin, final flag frame + army headline.
 */
import { env } from '../lib/env.js';
import { has, assetUrl } from '../lib/assets.js';
import { FlagSequence } from '../lib/sequence.js';
import { maskSplit } from '../lib/split.js';
import { createPulse, spikeUnder } from '../lib/pulse.js';

let seq;

export function initHero() {
  const hero = document.querySelector('[data-scene="hero"]');
  if (!hero) return null;
  const { gsap } = window;

  // Swap in the provided crest when it exists.
  const crestBox = hero.querySelector('[data-crest]');
  if (has('logo/namma-rcb-hq.png') && !crestBox.querySelector('img')) {
    crestBox.innerHTML = `<img src="${assetUrl('logo/namma-rcb-hq.png')}" alt="Namma RCB HQ crest" />`;
  }

  const canvas = hero.querySelector('.hero__flag');
  if (!seq) {
    seq = new FlagSequence(canvas, hero);
    if (env.motion && env.moving) seq.preload();
    else seq.loadLast();
  } else {
    seq.resize();
  }

  const pulseHost = hero.querySelector('[data-pulse]');
  const first = hero.querySelector('.hero__beat--first');
  const [glow, line] = createPulse(pulseHost, [spikeUnder(pulseHost, first), 0.78]);

  if (!env.motion) {
    gsap?.set([glow, line], { strokeDashoffset: 0 });
    return null;
  }

  return gsap.context(() => {
    const second = hero.querySelector('.hero__beat--second');
    const army = hero.querySelector('.hero__beat--army');
    const s1 = maskSplit(first), s2 = maskSplit(second), s3 = maskSplit(army);
    const crest = hero.querySelector('[data-crest]');
    const glint = hero.querySelector('.hero__glint-bar');
    const video = hero.querySelector('.hero__video');
    const extra = hero.querySelector('.hero__cta-extra');
    const cue = hero.querySelector('.hero__scroll');

    gsap.set([second, army], { visibility: 'visible' });
    gsap.set([...s2.chars, ...s3.chars], { yPercent: 110 });
    gsap.set(crest, { scale: 0.8, transformOrigin: '100% 0%' });
    gsap.set(extra, { autoAlpha: 0, y: 16 });

    // Load: the heartbeat draws across.
    gsap.to([glow, line], { strokeDashoffset: 0, duration: 1.6, ease: 'power2.inOut', delay: 0.2 });

    const frame = { p: 0 };
    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: hero,
        start: 'top top',
        end: env.mobile ? '+=150%' : '+=250%',
        pin: true,
        scrub: 0.5,
        anticipatePin: 1,
      },
    });

    // 0–15
    tl.to(cue, { autoAlpha: 0, duration: 8 }, 0)
      .fromTo(glow, { opacity: 0.25 }, { opacity: 0.8, duration: 7, yoyo: true, repeat: 1 }, 0);

    // 15–75: the sequence
    tl.to(frame, { p: 1, duration: 60, onUpdate: () => seq.render(frame.p) }, 15)
      .to(video, { opacity: 0.4, duration: 20 }, 15);

    // 15–45: line 1 out, line 2 in
    tl.to(s1.chars, { yPercent: -110, stagger: 0.2, duration: 6, ease: 'power2.in' }, 20)
      .to(s2.chars, { yPercent: 0, stagger: 0.2, duration: 6, ease: 'power3.out' }, 28)
      .to(s2.chars, { yPercent: -110, stagger: 0.15, duration: 5, ease: 'power2.in' }, 44);

    // 45–75: crest + army
    tl.to(crest, { scale: 1, duration: 20, ease: 'power1.out' }, 45);
    if (glint) tl.fromTo(glint, { x: -40 }, { x: 320, duration: 10, ease: 'power1.inOut' }, 52);
    const [l1, ...rest] = s3.lines;
    tl.to(s3.charsOf(l1), { yPercent: 0, stagger: 0.18, duration: 6, ease: 'power3.out' }, 52);
    rest.forEach((ln, i) => tl.to(s3.charsOf(ln), { yPercent: 0, stagger: 0.18, duration: 6, ease: 'power3.out' }, 61 + i * 4));

    // 75–100: CTA copy, hold, release
    tl.to(extra, { autoAlpha: 1, y: 0, duration: 8, ease: 'power2.out' }, 78)
      .to({}, { duration: 1 }, 99);

    return () => { s1.revert(); s2.revert(); s3.revert(); };
  }, hero);
}

export const resizeHero = () => seq?.resize();
