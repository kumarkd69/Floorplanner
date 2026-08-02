import type { Vec2 } from '@/types';

export const EPS = 1e-6;

/* --------------------------------------------------------------- vectors */

export const v = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(b.x - a.x, b.y - a.y);
export const dist2 = (a: Vec2, b: Vec2): number => (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
export const mid = (a: Vec2, b: Vec2): Vec2 => lerp(a, b, 0.5);
export const angleOf = (a: Vec2): number => Math.atan2(a.y, a.x);

export function normalize(a: Vec2): Vec2 {
  const l = len(a);
  return l < EPS ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}

/** Left-hand normal of a→b direction (in screen coords this points "up-left"). */
export function normal(a: Vec2, b: Vec2): Vec2 {
  const d = normalize(sub(b, a));
  return { x: d.y, y: -d.x };
}

export function rotate(p: Vec2, angle: number, origin: Vec2 = { x: 0, y: 0 }): Vec2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return { x: origin.x + dx * c - dy * s, y: origin.y + dx * s + dy * c };
}

export function equalish(a: Vec2, b: Vec2, tol = 1e-3): boolean {
  return Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;
}

/** Normalise an angle to (-π, π]. */
export function normalizeAngle(a: number): number {
  while (a <= -Math.PI) a += Math.PI * 2;
  while (a > Math.PI) a -= Math.PI * 2;
  return a;
}

/* -------------------------------------------------------------- segments */

/** Closest point to `p` on segment a→b, plus the parameter t along it. */
export function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): { point: Vec2; t: number; dist: number } {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < EPS) return { point: a, t: 0, dist: dist(p, a) };
  let t = dot(sub(p, a), ab) / l2;
  t = Math.max(0, Math.min(1, t));
  const point = add(a, mul(ab, t));
  return { point, t, dist: dist(p, point) };
}

export function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  return closestOnSegment(p, a, b).dist;
}

/**
 * Intersection of two infinite lines through (a1,a2) and (b1,b2).
 * Returns null when parallel.
 */
export function lineIntersection(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): Vec2 | null {
  const r = sub(a2, a1);
  const s = sub(b2, b1);
  const denom = cross(r, s);
  if (Math.abs(denom) < EPS) return null;
  const t = cross(sub(b1, a1), s) / denom;
  return add(a1, mul(r, t));
}

/** Intersection restricted to both segments' extents. */
export function segmentIntersection(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): Vec2 | null {
  const r = sub(a2, a1);
  const s = sub(b2, b1);
  const denom = cross(r, s);
  if (Math.abs(denom) < EPS) return null;
  const t = cross(sub(b1, a1), s) / denom;
  const u = cross(sub(b1, a1), r) / denom;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
  return add(a1, mul(r, t));
}

/* ------------------------------------------------------------------ arcs */

export interface Arc {
  center: Vec2;
  radius: number;
  startAngle: number;
  endAngle: number;
  /** True when the arc runs counter-clockwise from start to end. */
  ccw: boolean;
}

/**
 * Convert a chord + bulge into a circular arc.
 *
 * `bulge` is the sagitta as a fraction of the chord — the same convention DXF
 * uses (though DXF stores tan(θ/4)), which keeps curved-wall round-trips simple.
 */
export function arcFromBulge(a: Vec2, b: Vec2, bulge: number): Arc | null {
  if (Math.abs(bulge) < 1e-4) return null;
  const chord = dist(a, b);
  if (chord < EPS) return null;
  const sagitta = bulge * chord;
  const radius = (chord * chord) / (8 * Math.abs(sagitta)) + Math.abs(sagitta) / 2;
  const m = mid(a, b);
  const n = normal(a, b);
  const h = radius - Math.abs(sagitta);
  const sign = bulge > 0 ? 1 : -1;
  const center = add(m, mul(n, -sign * h));
  const startAngle = angleOf(sub(a, center));
  const endAngle = angleOf(sub(b, center));
  return { center, radius, startAngle, endAngle, ccw: bulge < 0 };
}

/** Sample an arc into a polyline; `segments` scales with radius for smoothness. */
export function arcPoints(arc: Arc, segments = 32): Vec2[] {
  let sweep = arc.endAngle - arc.startAngle;
  if (arc.ccw) {
    while (sweep > 0) sweep -= Math.PI * 2;
  } else {
    while (sweep < 0) sweep += Math.PI * 2;
  }
  const n = Math.max(4, Math.min(256, Math.ceil(segments * (Math.abs(sweep) / Math.PI))));
  const pts: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const ang = arc.startAngle + (sweep * i) / n;
    pts.push({
      x: arc.center.x + Math.cos(ang) * arc.radius,
      y: arc.center.y + Math.sin(ang) * arc.radius,
    });
  }
  return pts;
}

/** Point at parameter t (0..1) along a chord+bulge curve. */
export function pointOnCurve(a: Vec2, b: Vec2, bulge: number, t: number): Vec2 {
  const arc = arcFromBulge(a, b, bulge);
  if (!arc) return lerp(a, b, t);
  let sweep = arc.endAngle - arc.startAngle;
  if (arc.ccw) {
    while (sweep > 0) sweep -= Math.PI * 2;
  } else {
    while (sweep < 0) sweep += Math.PI * 2;
  }
  const ang = arc.startAngle + sweep * t;
  return {
    x: arc.center.x + Math.cos(ang) * arc.radius,
    y: arc.center.y + Math.sin(ang) * arc.radius,
  };
}

/** Unit tangent at parameter t along a chord+bulge curve. */
export function tangentOnCurve(a: Vec2, b: Vec2, bulge: number, t: number): Vec2 {
  const arc = arcFromBulge(a, b, bulge);
  if (!arc) return normalize(sub(b, a));
  const p0 = pointOnCurve(a, b, bulge, Math.max(0, t - 0.001));
  const p1 = pointOnCurve(a, b, bulge, Math.min(1, t + 0.001));
  return normalize(sub(p1, p0));
}

export function curveLength(a: Vec2, b: Vec2, bulge: number): number {
  const arc = arcFromBulge(a, b, bulge);
  if (!arc) return dist(a, b);
  let sweep = arc.endAngle - arc.startAngle;
  if (arc.ccw) {
    while (sweep > 0) sweep -= Math.PI * 2;
  } else {
    while (sweep < 0) sweep += Math.PI * 2;
  }
  return Math.abs(sweep) * arc.radius;
}

/* -------------------------------------------------------------- polygons */

/** Signed area; positive when wound clockwise in screen coords (y down). */
export function signedArea(poly: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export const polygonArea = (poly: Vec2[]): number => Math.abs(signedArea(poly));

export function polygonPerimeter(poly: Vec2[]): number {
  let p = 0;
  for (let i = 0; i < poly.length; i++) p += dist(poly[i], poly[(i + 1) % poly.length]);
  return p;
}

export function polygonCentroid(poly: Vec2[]): Vec2 {
  const a = signedArea(poly);
  if (Math.abs(a) < EPS) {
    // Degenerate — fall back to the vertex average.
    const s = poly.reduce((acc, p) => add(acc, p), v(0, 0));
    return mul(s, 1 / Math.max(1, poly.length));
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * A label anchor that stays inside concave rooms: the centroid when it is
 * inside, otherwise the widest interior span on the centroid's scanline.
 */
export function polygonLabelPoint(poly: Vec2[]): Vec2 {
  const c = polygonCentroid(poly);
  if (pointInPolygon(c, poly)) return c;
  const xs: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (a.y > c.y !== b.y > c.y) xs.push(((b.x - a.x) * (c.y - a.y)) / (b.y - a.y) + a.x);
  }
  xs.sort((m, n) => m - n);
  let best = c;
  let bestSpan = -1;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    const span = xs[i + 1] - xs[i];
    if (span > bestSpan) {
      bestSpan = span;
      best = { x: (xs[i] + xs[i + 1]) / 2, y: c.y };
    }
  }
  return best;
}

/* ------------------------------------------------------------------ AABB */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const EMPTY_RECT: Rect = { x: 0, y: 0, w: 0, h: 0 };

export function rectFromPoints(pts: Vec2[]): Rect {
  if (pts.length === 0) return EMPTY_RECT;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function rectFromCorners(a: Vec2, b: Vec2): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  };
}

export function expandRect(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 };
}

export function unionRect(a: Rect | null, b: Rect | null): Rect {
  if (!a) return b ?? EMPTY_RECT;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

export function rectContainsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

export function rectContainsPoint(r: Rect, p: Vec2): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

export function rectCenter(r: Rect): Vec2 {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** The four corners of an oriented box, in local→world order. */
export function orientedBoxCorners(
  center: Vec2,
  width: number,
  depth: number,
  rotation: number,
): Vec2[] {
  const hw = width / 2;
  const hd = depth / 2;
  return [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ].map((p) => add(center, rotate(p, rotation)));
}
