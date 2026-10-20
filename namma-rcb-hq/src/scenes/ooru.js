/**
 * CH.01 — Namma Ooru. Background: city-night video at 0.6× scroll speed.
 *
 *  enter (top→bottom … top→20%)  city-night clip-reveals from an inset window
 *                                 out of the hero (clip-path inset → 0).
 *  enter (top 70%)                pulse draws in and spikes under the heading;
 *                                 heading chars rise from 110%, 0.02 s stagger.
 *  whole pass (scrub)             ನಮ್ಮ ಊರು / ನಮ್ಮ ತಂಡ / ನಮ್ಮ ಸೇನೆ rows drift sideways
 *                                 in opposite directions. ನಮ್ಮ ಸೇನೆ is video-in-text.
 *
 * Reduced motion: no clip, parallax or drift; static rows, solid red ನಮ್ಮ ಸೇನೆ.
 */
import { env } from '../lib/env.js';
import { maskSplit } from '../lib/split.js';
import { createPulse, spikeUnder } from '../lib/pulse.js';
import { initVideoText } from '../components/videotext.js';

export function initOoru() {
  const sec = document.querySelector('[data-scene="ooru"]');
  if (!sec) return null;
  const { gsap } = window;
  const media = sec.querySelector(':scope > .media');
  const title = sec.querySelector('#ooru-title');
  const pulseHost = sec.querySelector('[data-pulse]');
  const [glow, line] = createPulse(pulseHost, [spikeUnder(pulseHost, title)]);

  if (env.moving && env.libs) initVideoText(sec.querySelectorAll('[data-vtext]'), media._media);

  if (!env.motion) {
    gsap?.set([glow, line], { strokeDashoffset: 0 });
    return null;
  }

  return gsap.context(() => {
    // Video parallax at 0.6× scroll: over a pass of D = vh + H px the media
    // shifts 0.4·D relative to the section. Oversize it so it always covers.
    const D = () => window.innerHeight + sec.offsetHeight;
    const size = () => {
      media.style.top = `${-0.2 * D()}px`;
      media.style.height = `${sec.offsetHeight + 0.4 * D()}px`;
    };
    size();
    gsap.fromTo(media, { y: () => -0.2 * D() }, {
      y: () => 0.2 * D(),
      ease: 'none',
      scrollTrigger: { trigger: sec, start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true, onRefreshInit: size },
    });

    // Clip-path chapter transition out of the hero.
    gsap.fromTo(media, { clipPath: 'inset(22% 14% 22% 14%)' }, {
      clipPath: 'inset(0% 0% 0% 0%)',
      ease: 'none',
      scrollTrigger: { trigger: sec, start: 'top bottom', end: 'top 15%', scrub: true },
    });

    // Heading + pulse.
    const s = maskSplit(title);
    gsap.set(s.chars, { yPercent: 110 });
    gsap.timeline({ scrollTrigger: { trigger: title, start: 'top 80%', once: true } })
      .to([glow, line], { strokeDashoffset: 0, duration: 1.4, ease: 'power2.inOut' }, 0)
      .to(s.chars, { yPercent: 0, duration: 0.9, stagger: 0.02, ease: 'power4.out' }, 0.15);

    // Drifting rows.
    sec.querySelectorAll('[data-drift]').forEach((row) => {
      const [from, to] = row.dataset.drift.split(',').map(Number);
      gsap.fromTo(row.querySelector('.drift__track'), { xPercent: from }, {
        xPercent: to,
        ease: 'none',
        scrollTrigger: { trigger: row, start: 'top bottom', end: 'bottom top', scrub: 0.6 },
      });
    });

    return () => s.revert();
  }, sec);
}
