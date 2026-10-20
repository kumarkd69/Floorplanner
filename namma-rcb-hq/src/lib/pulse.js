// The red heartbeat line. A flat trace with ECG spikes at given x positions
// (0..1). Drawn in with stroke-dashoffset via pathLength="1".
const NS = 'http://www.w3.org/2000/svg';

export function pulsePath(spikes, w = 1000, h = 100) {
  const mid = h * 0.62;
  const beat = [
    [-34, 0], [-28, -7], [-22, 0], [-14, 0], [-10, 9], [-4, -mid + 4], [4, h - mid - 4], [10, -12], [15, 0], [26, 0], [34, -9], [42, 0],
  ];
  let d = `M0 ${mid}`;
  for (const s of [...spikes].sort()) {
    const x = s * w;
    for (const [dx, dy] of beat) d += ` L${(x + dx).toFixed(1)} ${(mid + dy).toFixed(1)}`;
  }
  return `${d} L${w} ${mid}`;
}

export function createPulse(host, spikes = [0.5]) {
  host.querySelector('svg.pulse')?.remove();
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'pulse');
  svg.setAttribute('viewBox', '0 0 1000 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.height = '100%';
  const d = pulsePath(spikes);
  const paths = ['pulse__glow', 'pulse__line'].map((cls) => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('class', cls);
    p.setAttribute('d', d);
    p.setAttribute('pathLength', '1');
    p.style.strokeDasharray = '1';
    p.style.strokeDashoffset = '1';
    svg.appendChild(p);
    return p;
  });
  host.appendChild(svg);
  return paths;
}

/** Spike position (0..1 across `host`) centred under `target`'s first line. */
export function spikeUnder(host, target) {
  const h = host.getBoundingClientRect(), t = target.getBoundingClientRect();
  return Math.min(0.95, Math.max(0.05, (t.left + Math.min(t.width, 420) * 0.5 - h.left) / h.width));
}
