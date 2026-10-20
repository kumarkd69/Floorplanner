// Video-in-text: the chapter's playing video shows through the letters.
// Text is rasterised once into a mask canvas; each frame the video (locked to
// the viewport, so drifting letters act as a moving window) is drawn
// `source-in` over it. The DOM text stays underneath for layout and a11y.
import { env } from '../lib/env.js';

let items = [];
let source = null;
let running = false;
let last = 0;

function build() {
  const dpr = Math.min(env.dpr, 1.5);
  for (const it of items) {
    const span = it.el.querySelector('.vtext__text');
    const cs = getComputedStyle(span);
    const w = span.offsetWidth, h = span.offsetHeight;
    it.dpr = dpr;
    for (const c of [it.c, it.mask]) {
      c.width = Math.max(1, Math.round(w * dpr));
      c.height = Math.max(1, Math.round(h * dpr));
    }
    it.c.style.width = `${w}px`;
    it.c.style.height = `${h}px`;
    const m = it.mask.getContext('2d');
    m.setTransform(dpr, 0, 0, dpr, 0, 0);
    m.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const met = m.measureText(it.text);
    const asc = met.fontBoundingBoxAscent ?? parseFloat(cs.fontSize) * 0.8;
    const desc = met.fontBoundingBoxDescent ?? parseFloat(cs.fontSize) * 0.25;
    const lh = parseFloat(cs.lineHeight) || h;
    m.fillStyle = '#fff';
    m.fillText(it.text, 0, (lh - (asc + desc)) / 2 + asc);
  }
}

function draw(time) {
  if (time - last < 1 / 30) return;
  last = time;
  const src = source?.drawable?.();
  if (!src) return;
  const sw = src.videoWidth || src.width, sh = src.videoHeight || src.height;
  const vw = window.innerWidth, vh = window.innerHeight;
  const s = Math.max(vw / sw, vh / sh);
  const dw = sw * s, dh = sh * s;
  for (const it of items) {
    const r = it.c.getBoundingClientRect();
    if (r.right < 0 || r.left > vw || r.bottom < 0 || r.top > vh) continue;
    const { ctx, dpr } = it;
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(it.mask, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.filter = 'brightness(1.7) contrast(1.15) saturate(1.2)';
    ctx.drawImage(src, ((vw - dw) / 2 - r.left) * dpr, ((vh - dh) / 2 - r.top) * dpr, dw * dpr, dh * dpr);
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(215,38,46,.28)';
    ctx.fillRect(0, 0, it.c.width, it.c.height);
    if (!it.live) { it.live = true; it.el.classList.add('is-live'); }
  }
}

export async function initVideoText(nodes, media) {
  if (!nodes.length || !media || items.length) return;
  source = media;
  items = [...nodes].map((el) => {
    const c = document.createElement('canvas');
    c.setAttribute('aria-hidden', 'true');
    el.appendChild(c);
    return { el, c, ctx: c.getContext('2d'), mask: document.createElement('canvas'), text: el.textContent.trim() };
  });
  await document.fonts.ready;
  await document.fonts.load('800 100px "Anek Kannada"', 'ನಮ್ಮ ಸೇನೆ').catch(() => {});
  build();
  const io = new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !running) { window.gsap.ticker.add(draw); running = true; }
    else if (!e.isIntersecting && running) { window.gsap.ticker.remove(draw); running = false; }
  });
  io.observe(nodes[0].closest('section'));
}

export const rebuildVideoText = () => items.length && build();
