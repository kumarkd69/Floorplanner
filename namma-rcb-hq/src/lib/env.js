// Runtime capability flags. Read once at boot; `mobile` is live so rebuilds pick it up.
const mq = (q) => window.matchMedia(q).matches;
const conn = navigator.connection || {};

export const env = {
  get mobile() { return mq('(max-width: 767px)'); },
  reduced: mq('(prefers-reduced-motion: reduce)'),
  // Save-Data, or a phone that reports 4 GB or less: posters only, no sequence.
  lowPower: Boolean(conn.saveData) || (navigator.deviceMemory !== undefined && navigator.deviceMemory <= 4),
  finePointer: mq('(hover: hover) and (pointer: fine)'),
  get dpr() { return Math.min(window.devicePixelRatio || 1, 2); },
  libs: Boolean(window.gsap && window.ScrollTrigger),
};

// Full motion = scroll timelines, pins and scrubbing.
env.motion = env.libs && !env.reduced;
// Moving pictures = videos and the flag sequence.
env.moving = !env.reduced && !env.lowPower;
