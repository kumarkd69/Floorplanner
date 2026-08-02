import type { ID, Project, SnapKind, SnapResult, SnapSettings, Vec2 } from '@/types';
import {
  add,
  closestOnSegment,
  dist,
  mid,
  mul,
  normalize,
  sub,
} from './geometry';
import { furnitureCorners, wallCenterline } from './entities';

export const DEFAULT_SNAP: SnapSettings = {
  enabled: true,
  grid: true,
  endpoint: true,
  midpoint: true,
  edge: true,
  center: true,
  furniture: true,
  angle: true,
  guides: true,
  radius: 12,
  angleStep: 15,
};

/** Snap priority — a corner always wins over a grid line at the same distance. */
const PRIORITY: Record<SnapKind, number> = {
  endpoint: 100,
  corner: 100,
  intersection: 95,
  midpoint: 85,
  center: 80,
  furniture: 70,
  edge: 60,
  'align-x': 55,
  'align-y': 55,
  angle: 50,
  grid: 10,
};

interface Candidate {
  point: Vec2;
  kind: SnapKind;
  refId?: ID;
  guides?: Array<{ a: Vec2; b: Vec2; kind: SnapKind }>;
}

export interface SnapContext {
  project: Project;
  settings: SnapSettings;
  /** World mm per screen pixel — keeps the snap radius constant on screen. */
  worldPerPx: number;
  /** Entities to ignore (the ones being dragged). */
  exclude?: Set<ID>;
  /** Anchor for angle snapping — the fixed end of the segment being drawn. */
  origin?: Vec2 | null;
}

/**
 * Resolve a raw cursor position to the nearest meaningful point.
 *
 * Candidates are gathered from every enabled source, then scored by
 * `distance − priority × tolerance/2` so that a slightly-farther corner still
 * beats a nearer grid intersection. That ordering is what makes drawing feel
 * "magnetic" rather than merely gridded.
 */
export function snapPoint(raw: Vec2, ctx: SnapContext): SnapResult {
  const { project, settings } = ctx;
  const none: SnapResult = { point: raw, kinds: [], guides: [], refIds: [] };
  if (!settings.enabled) return none;

  const tol = settings.radius * ctx.worldPerPx;
  const exclude = ctx.exclude ?? new Set<ID>();
  const candidates: Candidate[] = [];

  const nearby = (p: Vec2) => dist(p, raw) <= tol;

  for (const id of project.order) {
    const e = project.entities[id];
    if (!e || exclude.has(id) || e.hidden) continue;
    const layer = project.layers.find((l) => l.id === e.layerId);
    if (layer && !layer.visible) continue;

    if (e.type === 'wall') {
      const line = wallCenterline(e);
      if (settings.endpoint) {
        for (const p of [line[0], line[line.length - 1]]) {
          if (nearby(p)) candidates.push({ point: p, kind: 'endpoint', refId: id });
        }
      }
      if (settings.midpoint) {
        const m = mid(line[0], line[line.length - 1]);
        if (nearby(m)) candidates.push({ point: m, kind: 'midpoint', refId: id });
      }
      if (settings.edge) {
        for (let i = 0; i + 1 < line.length; i++) {
          const c = closestOnSegment(raw, line[i], line[i + 1]);
          if (c.dist <= tol) candidates.push({ point: c.point, kind: 'edge', refId: id });
        }
      }
    } else if (e.type === 'room') {
      if (settings.endpoint) {
        for (const p of e.polygon) if (nearby(p)) candidates.push({ point: p, kind: 'corner', refId: id });
      }
      if (settings.edge) {
        for (let i = 0; i < e.polygon.length; i++) {
          const a = e.polygon[i];
          const b = e.polygon[(i + 1) % e.polygon.length];
          const c = closestOnSegment(raw, a, b);
          if (c.dist <= tol) candidates.push({ point: c.point, kind: 'edge', refId: id });
          if (settings.midpoint) {
            const m = mid(a, b);
            if (nearby(m)) candidates.push({ point: m, kind: 'midpoint', refId: id });
          }
        }
      }
    } else if (e.type === 'furniture' && settings.furniture) {
      const corners = furnitureCorners(e);
      for (const p of corners) if (nearby(p)) candidates.push({ point: p, kind: 'furniture', refId: id });
      for (let i = 0; i < corners.length; i++) {
        const m = mid(corners[i], corners[(i + 1) % corners.length]);
        if (nearby(m)) candidates.push({ point: m, kind: 'furniture', refId: id });
      }
      if (settings.center && nearby(e.position)) {
        candidates.push({ point: e.position, kind: 'center', refId: id });
      }
    }
  }

  // Angle snapping from the drawing origin — orthogonal and 15° increments.
  if (settings.angle && ctx.origin) {
    const o = ctx.origin;
    const d = sub(raw, o);
    const r = Math.hypot(d.x, d.y);
    if (r > 1e-3) {
      const step = (settings.angleStep * Math.PI) / 180;
      const a = Math.atan2(d.y, d.x);
      const snapped = Math.round(a / step) * step;
      const p = { x: o.x + Math.cos(snapped) * r, y: o.y + Math.sin(snapped) * r };
      if (dist(p, raw) <= tol * 1.5) {
        candidates.push({
          point: p,
          kind: 'angle',
          guides: [{ a: o, b: add(o, mul(normalize(sub(p, o)), r + tol * 20)), kind: 'angle' }],
        });
      }
    }
  }

  // Grid is the fallback so there is always something to land on.
  if (settings.grid) {
    const g = project.gridSize;
    const p = { x: Math.round(raw.x / g) * g, y: Math.round(raw.y / g) * g };
    if (dist(p, raw) <= tol) candidates.push({ point: p, kind: 'grid' });
  }

  if (candidates.length === 0) return none;

  let best = candidates[0];
  let bestScore = Infinity;
  for (const c of candidates) {
    const score = dist(c.point, raw) - (PRIORITY[c.kind] * tol) / 200;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }

  // Merge any coincident candidates so the badge can read "endpoint + grid".
  const kinds = new Set<SnapKind>([best.kind]);
  const refIds = new Set<ID>();
  if (best.refId) refIds.add(best.refId);
  for (const c of candidates) {
    if (c !== best && dist(c.point, best.point) < 0.5) {
      kinds.add(c.kind);
      if (c.refId) refIds.add(c.refId);
    }
  }

  return {
    point: best.point,
    kinds: [...kinds],
    guides: best.guides ?? [],
    refIds: [...refIds],
  };
}

/**
 * Alignment guides for a moving object: when the moving bounds' centre or edges
 * line up with another object's, nudge onto that line and report a guide to draw.
 */
export function alignmentSnap(
  movingCenter: Vec2,
  movingHalf: Vec2,
  ctx: SnapContext,
): { delta: Vec2; guides: Array<{ a: Vec2; b: Vec2; kind: SnapKind }> } {
  const guides: Array<{ a: Vec2; b: Vec2; kind: SnapKind }> = [];
  const delta = { x: 0, y: 0 };
  if (!ctx.settings.enabled || !ctx.settings.guides) return { delta, guides };

  const tol = ctx.settings.radius * ctx.worldPerPx;
  const exclude = ctx.exclude ?? new Set<ID>();

  const xLines: Array<{ v: number; ref: Vec2 }> = [];
  const yLines: Array<{ v: number; ref: Vec2 }> = [];

  for (const id of ctx.project.order) {
    const e = ctx.project.entities[id];
    if (!e || exclude.has(id) || e.hidden) continue;
    if (e.type === 'furniture') {
      const c = e.position;
      const corners = furnitureCorners(e);
      const xs = corners.map((p) => p.x);
      const ys = corners.map((p) => p.y);
      xLines.push({ v: c.x, ref: c }, { v: Math.min(...xs), ref: c }, { v: Math.max(...xs), ref: c });
      yLines.push({ v: c.y, ref: c }, { v: Math.min(...ys), ref: c }, { v: Math.max(...ys), ref: c });
    } else if (e.type === 'wall') {
      xLines.push({ v: e.a.x, ref: e.a }, { v: e.b.x, ref: e.b });
      yLines.push({ v: e.a.y, ref: e.a }, { v: e.b.y, ref: e.b });
    }
  }

  const probeX = [movingCenter.x, movingCenter.x - movingHalf.x, movingCenter.x + movingHalf.x];
  const probeY = [movingCenter.y, movingCenter.y - movingHalf.y, movingCenter.y + movingHalf.y];

  let bestX: { d: number; delta: number; line: number; ref: Vec2 } | null = null;
  for (const px of probeX) {
    for (const l of xLines) {
      const d = Math.abs(px - l.v);
      if (d <= tol && (!bestX || d < bestX.d)) bestX = { d, delta: l.v - px, line: l.v, ref: l.ref };
    }
  }
  let bestY: { d: number; delta: number; line: number; ref: Vec2 } | null = null;
  for (const py of probeY) {
    for (const l of yLines) {
      const d = Math.abs(py - l.v);
      if (d <= tol && (!bestY || d < bestY.d)) bestY = { d, delta: l.v - py, line: l.v, ref: l.ref };
    }
  }

  if (bestX) {
    delta.x = bestX.delta;
    const y0 = Math.min(bestX.ref.y, movingCenter.y) - 1000;
    const y1 = Math.max(bestX.ref.y, movingCenter.y) + 1000;
    guides.push({ a: { x: bestX.line, y: y0 }, b: { x: bestX.line, y: y1 }, kind: 'align-x' });
  }
  if (bestY) {
    delta.y = bestY.delta;
    const x0 = Math.min(bestY.ref.x, movingCenter.x) - 1000;
    const x1 = Math.max(bestY.ref.x, movingCenter.x) + 1000;
    guides.push({ a: { x: x0, y: bestY.line }, b: { x: x1, y: bestY.line }, kind: 'align-y' });
  }

  return { delta, guides };
}

export const SNAP_LABEL: Record<SnapKind, string> = {
  grid: 'Grid',
  endpoint: 'Endpoint',
  midpoint: 'Midpoint',
  corner: 'Corner',
  edge: 'Edge',
  center: 'Center',
  intersection: 'Intersection',
  furniture: 'Furniture',
  angle: 'Angle',
  'align-x': 'Align',
  'align-y': 'Align',
};
