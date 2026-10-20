// Flag image sequence drawn to <canvas>. Frames 0–40 preload first, the rest
// lazy-load in idle time. Falls back to the procedural flag when the frames
// are not in /public/assets yet.
import { env } from './env.js';
import { has, assetUrl, loadImage, placeholderLabel } from './assets.js';
import { drawFlag } from './flag.js';

const pad = (n) => String(n).padStart(4, '0');
const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 60));

export class FlagSequence {
  constructor(canvas, host) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.portrait = env.mobile;
    const m = has('seq/flag-m/flag_0001.webp');
    const d = has('seq/flag/flag_0001.webp');
    this.dir = this.portrait && m ? 'seq/flag-m' : 'seq/flag';
    this.count = this.dir === 'seq/flag-m' ? 80 : 160;
    this.mode = (this.portrait && m) || d ? 'frames' : 'procedural';
    this.frames = new Array(this.count);
    this.p = 0;
    if (this.mode === 'procedural') placeholderLabel(host, `${this.dir}/flag_0001–${pad(this.count)}.webp`);
    this.resize();
  }

  src(i) { return assetUrl(`${this.dir}/flag_${pad(i + 1)}.webp`); }

  async preload() {
    if (this.mode !== 'frames') return;
    const get = (i) => loadImage(this.src(i)).then((img) => { this.frames[i] = img; });
    await Promise.all(Array.from({ length: Math.min(41, this.count) }, (_, i) => get(i)));
    this.render(this.p);
    let next = 41;
    const batch = () => {
      if (next >= this.count) return;
      const jobs = [];
      for (let k = 0; k < 10 && next < this.count; k++) jobs.push(get(next++));
      Promise.all(jobs).then(() => idle(batch));
    };
    idle(batch);
  }

  /** Load just the last frame (reduced motion / low power). */
  async loadLast() {
    if (this.mode !== 'frames') return this.render(1);
    this.frames[this.count - 1] = await loadImage(this.src(this.count - 1));
    this.render(1);
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = env.dpr;
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.portrait = env.mobile;
    this.render(this.p);
  }

  render(p) {
    this.p = p;
    const { ctx, canvas } = this;
    const w = canvas.width, h = canvas.height;
    if (this.mode === 'procedural') return drawFlag(ctx, w, h, p, this.portrait);
    let i = Math.round(p * (this.count - 1));
    while (i > 0 && !this.frames[i]) i--;
    const img = this.frames[i];
    ctx.fillStyle = '#0A0909';
    ctx.fillRect(0, 0, w, h);
    if (!img) return;
    const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }
}
