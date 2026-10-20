// Procedural stand-ins for missing footage. Rendered small (CSS scales them up
// under the grade stack), at ~30 fps, and only while on screen.
import { noiseTile } from './assets.js';

const TAU = Math.PI * 2;
const rand = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

export class PlaceholderClip {
  constructor(kind = 'default', portrait = false) {
    this.kind = kind;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'ph';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.w = this.canvas.width = portrait ? 216 : 384;
    this.h = this.canvas.height = portrait ? 384 : 216;
    this.ctx = this.canvas.getContext('2d');
    this.raf = 0;
    this.last = 0;
    this.t = 0;
    const r = rand(kind.length * 977 + 13);
    this.items = Array.from({ length: 34 }, () => [r(), r(), r(), r()]);
    this.pattern = this.ctx.createPattern(noiseTile(), 'repeat');
    this.draw(0);
  }

  play() {
    if (this.raf) return;
    const loop = (now) => {
      this.raf = requestAnimationFrame(loop);
      if (now - this.last < 33) return;
      this.t += Math.min(now - this.last, 100) / 1000;
      this.last = now;
      this.draw(this.t);
    };
    this.last = performance.now();
    this.raf = requestAnimationFrame(loop);
  }

  pause() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  draw(t) {
    const { ctx, w, h } = this;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    (this[this.kind] || this.default).call(this, ctx, w, h, t);
    // film grain
    ctx.globalCompositeOperation = 'overlay';
    ctx.save();
    ctx.translate((Math.random() * 128) | 0, (Math.random() * 128) | 0);
    ctx.fillStyle = this.pattern;
    ctx.fillRect(-128, -128, w + 256, h + 256);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
  }

  // Slow push down a tunnel toward floodlights.
  tunnel(ctx, w, h, t) {
    const cx = w / 2, cy = h * 0.46;
    ctx.fillStyle = '#070606';
    ctx.fillRect(0, 0, w, h);
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, h * (0.55 + 0.04 * Math.sin(t * 1.3)));
    glow.addColorStop(0, 'rgba(255,236,205,.95)');
    glow.addColorStop(0.18, 'rgba(255,190,130,.45)');
    glow.addColorStop(1, 'rgba(255,120,80,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    const ribs = 14;
    for (let k = 0; k < ribs; k++) {
      const d = (k / ribs + t * 0.06) % 1;
      const s = Math.pow(d, 2.4);
      const rw = w * 0.08 + w * 1.6 * s, rh = h * 0.06 + h * 1.6 * s;
      ctx.strokeStyle = `rgba(255,214,170,${0.05 + 0.3 * s})`;
      ctx.lineWidth = 0.6 + 4 * s;
      ctx.strokeRect(cx - rw / 2, cy - rh / 2, rw, rh);
      // ceiling lamps
      ctx.fillStyle = `rgba(255,240,220,${0.15 + 0.6 * s})`;
      ctx.fillRect(cx - rw * 0.06, cy - rh / 2 - 1, rw * 0.12, 1 + 2 * s);
    }
  }

  // Bengaluru at night: light trails, bokeh, rain.
  city(ctx, w, h, t) {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#0b0809');
    sky.addColorStop(0.55, '#1c0d0e');
    sky.addColorStop(1, '#080606');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    this.items.forEach(([a, b, c, d], i) => {
      if (i < 12) { // bokeh
        const x = (a * w + t * 4 * (b - 0.5)) % w, y = b * h * 0.55;
        ctx.fillStyle = `rgba(${c > 0.5 ? '255,170,90' : '215,60,60'},${0.06 + d * 0.1})`;
        ctx.beginPath();
        ctx.arc(x, y, 6 + d * 16, 0, TAU);
        ctx.fill();
        return;
      }
      const lane = h * (0.58 + b * 0.36);
      const speed = (30 + c * 90) * (d > 0.5 ? 1 : -1);
      const len = 30 + a * 120;
      let x = (a * w * 3 + t * speed) % (w + len);
      if (x < 0) x += w + len;
      x -= len;
      ctx.strokeStyle = d > 0.5 ? `rgba(255,60,40,${0.35 + c * 0.4})` : `rgba(255,214,150,${0.3 + c * 0.4})`;
      ctx.lineWidth = 1 + b * 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, lane);
      ctx.lineTo(x + len, lane + (b - 0.5) * 4);
      ctx.stroke();
    });
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(220,210,200,.08)';
    ctx.lineWidth = 0.7;
    for (let i = 0; i < 40; i++) {
      const [a, b] = this.items[i % this.items.length];
      const x = (a * w + i * 37) % w, y = ((b * h + t * 220 + i * 53) % (h + 20)) - 20;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 3, y + 12);
      ctx.stroke();
    }
  }

  // Red-gold flags waving, shallow focus.
  crowd(ctx, w, h, t) {
    ctx.fillStyle = '#0d0909';
    ctx.fillRect(0, 0, w, h);
    ctx.filter = 'blur(10px)';
    this.items.slice(0, 10).forEach(([a, b, c], i) => {
      const x = a * w + Math.sin(t * (0.6 + c) + i) * 18;
      const y = h * 0.25 + b * h * 0.5 + Math.cos(t * 0.8 + i) * 10;
      ctx.fillStyle = c > 0.7 ? 'rgba(212,170,79,.5)' : 'rgba(200,30,38,.6)';
      ctx.beginPath();
      ctx.ellipse(x, y, 30 + c * 40, 16 + b * 24, Math.sin(t + i) * 0.6, 0, TAU);
      ctx.fill();
    });
    ctx.filter = 'none';
  }

  // Café screening: faces lit by a flickering screen.
  party(ctx, w, h, t) {
    ctx.fillStyle = '#080606';
    ctx.fillRect(0, 0, w, h);
    const f = 0.7 + 0.3 * Math.sin(t * 7) * Math.sin(t * 2.3);
    const g = ctx.createRadialGradient(w / 2, h * 0.3, 0, w / 2, h * 0.3, w * 0.6);
    g.addColorStop(0, `rgba(255,210,180,${0.55 * f})`);
    g.addColorStop(1, 'rgba(120,30,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#050404';
    for (let i = 0; i < 9; i++) {
      const x = (i + 0.5) * (w / 9), y = h * 0.86 + Math.sin(t + i) * 2;
      ctx.beginPath();
      ctx.ellipse(x, y, w / 22, h / 7, 0, 0, TAU);
      ctx.fill();
    }
  }

  default(ctx, w, h, t) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#1a0c0d');
    g.addColorStop(1, '#070606');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const r = ctx.createRadialGradient(w * (0.5 + 0.2 * Math.sin(t * 0.3)), h * 0.5, 0, w * 0.5, h * 0.5, w * 0.5);
    r.addColorStop(0, 'rgba(215,38,46,.35)');
    r.addColorStop(1, 'rgba(215,38,46,0)');
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, w, h);
  }
}
