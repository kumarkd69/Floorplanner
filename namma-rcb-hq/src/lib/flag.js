// Procedural stand-in for the flag sequence: a red / gold / black flag
// unfurls from a pole out of darkness; the gold seam catches a moving light.
// p = 0..1 sequence progress (frame / lastFrame).
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const BANDS = [
  [0, 0.47, [215, 38, 46]],
  [0.47, 0.515, [212, 170, 79]],
  [0.515, 1, [34, 25, 27]],
];

export function drawFlag(ctx, w, h, p, portrait = false) {
  ctx.fillStyle = '#0A0909';
  ctx.fillRect(0, 0, w, h);
  if (p <= 0.002) return;

  const e = 1 - Math.pow(1 - p, 2.2);
  const light = smooth(0, 0.55, p);
  const t = p * 5.5;

  const haze = ctx.createRadialGradient(w * 0.82, -h * 0.1, 0, w * 0.82, -h * 0.1, w * 0.95);
  haze.addColorStop(0, `rgba(255,196,140,${0.2 * light})`);
  haze.addColorStop(1, 'rgba(255,196,140,0)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, w, h);

  const poleX = portrait ? -w * 0.04 : w * 0.04;
  const top = h * (portrait ? 0.2 : 0.14);
  const fh = h * (portrait ? 0.5 : 0.6);
  const fw = (portrait ? w * 1.7 : w * 1.1) * e;
  const glintAt = p * 1.3 - 0.15;
  const N = 72;
  let prev = null;

  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const x = poleX + u * fw;
    const phase = u * 6.5 - t * 2.4;
    const amp = fh * 0.07 * u * (0.4 + 0.6 * e);
    const sh = 1 - 0.12 * u;
    const y0 = top + Math.sin(phase) * amp + u * u * fh * 0.05 + (fh * (1 - sh)) / 2;
    const y1 = y0 + fh * sh;
    const shade = 0.5 + 0.5 * Math.cos(phase - 0.6);
    const b = (0.22 + 0.78 * shade) * light;
    const glint = Math.exp(-((u - glintAt) ** 2) / 0.004) * light;
    const cur = { x, y0, y1, b, glint };
    if (prev) {
      const bb = (prev.b + b) / 2, gl = (prev.glint + glint) / 2;
      for (const [a, z, rgb] of BANDS) {
        const gold = rgb[0] === 212;
        const k = gold ? Math.min(1.4, bb * 1.25 + gl * 0.9) : bb;
        const c = rgb.map((v) => Math.min(255, Math.round(v * k + (gold ? gl * 60 : 0))));
        ctx.fillStyle = `rgb(${c})`;
        ctx.beginPath();
        ctx.moveTo(prev.x - 0.6, prev.y0 + (prev.y1 - prev.y0) * a);
        ctx.lineTo(x + 0.6, y0 + (y1 - y0) * a);
        ctx.lineTo(x + 0.6, y0 + (y1 - y0) * z);
        ctx.lineTo(prev.x - 0.6, prev.y0 + (prev.y1 - prev.y0) * z);
        ctx.closePath();
        ctx.fill();
      }
    }
    prev = cur;
  }

  // pole
  ctx.fillStyle = `rgba(138,107,44,${0.9 * light})`;
  ctx.fillRect(poleX - 3, top - h * 0.06, 4, h);
}
