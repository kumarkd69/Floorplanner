import type {
  Door,
  Entity,
  Furniture,
  ID,
  Project,
  Room,
  Vec2,
  Wall,
  WindowOpening,
} from '@/types';
import {
  add,
  arcFromBulge,
  arcPoints,
  closestOnSegment,
  curveLength,
  dist,
  distToSegment,
  mul,
  normalize,
  orientedBoxCorners,
  pointInPolygon,
  pointOnCurve,
  polygonArea,
  polygonPerimeter,
  rectFromPoints,
  rotate,
  sub,
  tangentOnCurve,
  type Rect,
} from './geometry';

/* --------------------------------------------------------- wall geometry */

/** The wall centreline sampled as a polyline (2 points when straight). */
export function wallCenterline(wall: Wall): Vec2[] {
  const arc = arcFromBulge(wall.a, wall.b, wall.bulge);
  return arc ? arcPoints(arc) : [wall.a, wall.b];
}

export function wallLength(wall: Wall): number {
  return curveLength(wall.a, wall.b, wall.bulge);
}

/**
 * The wall's filled outline: the centreline offset by ±half thickness.
 *
 * Offsetting the sampled centreline (rather than solving the arc offset
 * analytically) keeps straight and curved walls on one code path and matches
 * exactly what we render, so hit-testing never disagrees with the pixels.
 */
export function wallOutline(wall: Wall): Vec2[] {
  const line = wallCenterline(wall);
  const h = wall.thickness / 2;
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  for (let i = 0; i < line.length; i++) {
    const prev = line[Math.max(0, i - 1)];
    const next = line[Math.min(line.length - 1, i + 1)];
    const d = normalize(sub(next, prev));
    const n = { x: d.y, y: -d.x };
    left.push(add(line[i], mul(n, h)));
    right.push(add(line[i], mul(n, -h)));
  }
  right.reverse();
  return [...left, ...right];
}

/** Point at parameter t (0..1) along the wall centreline. */
export function wallPointAt(wall: Wall, t: number): Vec2 {
  return pointOnCurve(wall.a, wall.b, wall.bulge, t);
}

/** Unit tangent at parameter t along the wall centreline. */
export function wallTangentAt(wall: Wall, t: number): Vec2 {
  return tangentOnCurve(wall.a, wall.b, wall.bulge, t);
}

export function wallNormalAt(wall: Wall, t: number): Vec2 {
  const d = wallTangentAt(wall, t);
  return { x: d.y, y: -d.x };
}

/** Project a world point onto the wall centreline, returning its parameter. */
export function wallParamAt(wall: Wall, p: Vec2): { t: number; dist: number; point: Vec2 } {
  const line = wallCenterline(wall);
  let best = { t: 0, dist: Infinity, point: line[0] };
  let acc = 0;
  const total = polylineLength(line);
  for (let i = 0; i + 1 < line.length; i++) {
    const seg = closestOnSegment(p, line[i], line[i + 1]);
    if (seg.dist < best.dist) {
      const segLen = dist(line[i], line[i + 1]);
      best = { t: total < 1e-9 ? 0 : (acc + seg.t * segLen) / total, dist: seg.dist, point: seg.point };
    }
    acc += dist(line[i], line[i + 1]);
  }
  return best;
}

function polylineLength(pts: Vec2[]): number {
  let l = 0;
  for (let i = 0; i + 1 < pts.length; i++) l += dist(pts[i], pts[i + 1]);
  return l;
}

/* ------------------------------------------------------ opening geometry */

export interface OpeningPlacement {
  center: Vec2;
  /** Unit vector along the wall at the opening. */
  along: Vec2;
  /** Unit vector across the wall. */
  across: Vec2;
  thickness: number;
  start: Vec2;
  end: Vec2;
}

export function openingPlacement(
  opening: Door | WindowOpening,
  wall: Wall,
): OpeningPlacement {
  const center = wallPointAt(wall, opening.t);
  const along = wallTangentAt(wall, opening.t);
  const across = { x: along.y, y: -along.x };
  const half = opening.width / 2;
  return {
    center,
    along,
    across,
    thickness: wall.thickness,
    start: add(center, mul(along, -half)),
    end: add(center, mul(along, half)),
  };
}

/**
 * The parameter range an opening occupies on its wall, clamped so it can never
 * hang off the end — this is what makes "impossible placement" impossible.
 */
export function clampOpeningT(width: number, wall: Wall, t: number): number {
  const L = wallLength(wall);
  if (L <= width) return 0.5;
  const margin = width / 2 / L;
  return Math.max(margin, Math.min(1 - margin, t));
}

/** True when the opening fits on the wall at all (with a small jamb allowance). */
export function openingFits(width: number, wall: Wall): boolean {
  return wallLength(wall) >= width + 20;
}

/**
 * Do two openings on the same wall overlap? Used to reject drops that would
 * put a door through a window.
 */
export function openingsOverlap(
  a: { t: number; width: number },
  b: { t: number; width: number },
  wall: Wall,
): boolean {
  const L = wallLength(wall);
  const a0 = a.t * L - a.width / 2;
  const a1 = a.t * L + a.width / 2;
  const b0 = b.t * L - b.width / 2;
  const b1 = b.t * L + b.width / 2;
  return a0 < b1 && b0 < a1;
}

/* --------------------------------------------------------------- bounds */

export function entityBounds(entity: Entity, project: Project): Rect {
  switch (entity.type) {
    case 'wall':
      return rectFromPoints(wallOutline(entity));
    case 'room':
      return rectFromPoints(entity.polygon);
    case 'door':
    case 'window': {
      const wall = project.entities[entity.wallId];
      if (!wall || wall.type !== 'wall') return rectFromPoints([{ x: 0, y: 0 }]);
      const pl = openingPlacement(entity, wall);
      const h = mul(pl.across, wall.thickness / 2 + (entity.type === 'door' ? entity.width : 0));
      return rectFromPoints([
        add(pl.start, h),
        add(pl.end, h),
        sub(pl.start, h),
        sub(pl.end, h),
      ]);
    }
    case 'furniture':
      return rectFromPoints(furnitureCorners(entity));
    case 'dimension':
      return rectFromPoints(entity.points);
    case 'text': {
      const w = entity.text.length * entity.size * 0.6;
      return { x: entity.position.x, y: entity.position.y - entity.size, w, h: entity.size * 1.4 };
    }
  }
}

export function furnitureCorners(f: Furniture): Vec2[] {
  return orientedBoxCorners(f.position, f.width, f.depth, f.rotation);
}

export function selectionBounds(project: Project, ids: ID[]): Rect | null {
  let out: Rect | null = null;
  for (const id of ids) {
    const e = project.entities[id];
    if (!e) continue;
    const b = entityBounds(e, project);
    out = out
      ? {
          x: Math.min(out.x, b.x),
          y: Math.min(out.y, b.y),
          w: Math.max(out.x + out.w, b.x + b.w) - Math.min(out.x, b.x),
          h: Math.max(out.y + out.h, b.y + b.h) - Math.min(out.y, b.y),
        }
      : b;
  }
  return out;
}

export function projectBounds(project: Project): Rect | null {
  let out: Rect | null = null;
  for (const id of project.order) {
    const e = project.entities[id];
    if (!e) continue;
    const b = entityBounds(e, project);
    out = out
      ? {
          x: Math.min(out.x, b.x),
          y: Math.min(out.y, b.y),
          w: Math.max(out.x + out.w, b.x + b.w) - Math.min(out.x, b.x),
          h: Math.max(out.y + out.h, b.y + b.h) - Math.min(out.y, b.y),
        }
      : b;
  }
  return out;
}

/* ------------------------------------------------------------ hit testing */

/**
 * Is `p` (world mm) on this entity, given a screen-constant tolerance already
 * converted to world units?
 */
export function hitTestEntity(
  entity: Entity,
  p: Vec2,
  tol: number,
  project: Project,
): boolean {
  switch (entity.type) {
    case 'wall': {
      const line = wallCenterline(entity);
      const reach = entity.thickness / 2 + tol;
      for (let i = 0; i + 1 < line.length; i++) {
        if (distToSegment(p, line[i], line[i + 1]) <= reach) return true;
      }
      return false;
    }
    case 'room':
      return pointInPolygon(p, entity.polygon);
    case 'door':
    case 'window': {
      const wall = project.entities[entity.wallId];
      if (!wall || wall.type !== 'wall') return false;
      const pl = openingPlacement(entity, wall);
      return distToSegment(p, pl.start, pl.end) <= wall.thickness / 2 + tol;
    }
    case 'furniture': {
      const local = rotate(sub(p, entity.position), -entity.rotation);
      return (
        Math.abs(local.x) <= entity.width / 2 + tol && Math.abs(local.y) <= entity.depth / 2 + tol
      );
    }
    case 'dimension': {
      for (let i = 0; i + 1 < entity.points.length; i++) {
        if (distToSegment(p, entity.points[i], entity.points[i + 1]) <= tol * 2) return true;
      }
      return false;
    }
    case 'text': {
      const b = entityBounds(entity, project);
      return p.x >= b.x - tol && p.x <= b.x + b.w + tol && p.y >= b.y - tol && p.y <= b.y + b.h + tol;
    }
  }
}

/* --------------------------------------------------------------- queries */

export function isSelectable(entity: Entity, project: Project): boolean {
  if (entity.locked || entity.hidden) return false;
  const layer = project.layers.find((l) => l.id === entity.layerId);
  if (layer && (layer.locked || !layer.visible)) return false;
  return true;
}

export function isVisible(entity: Entity, project: Project): boolean {
  if (entity.hidden) return false;
  const layer = project.layers.find((l) => l.id === entity.layerId);
  return !layer || layer.visible;
}

export function wallsOf(project: Project): Wall[] {
  const out: Wall[] = [];
  for (const id of project.order) {
    const e = project.entities[id];
    if (e && e.type === 'wall') out.push(e);
  }
  return out;
}

export function roomsOf(project: Project): Room[] {
  const out: Room[] = [];
  for (const id of project.order) {
    const e = project.entities[id];
    if (e && e.type === 'room') out.push(e);
  }
  return out;
}

/**
 * Openings hosted on a wall, indexed per project.
 *
 * The renderer asks this for every visible wall on every frame; scanning the
 * whole document each time is O(walls × entities), which dominates the frame
 * budget on large plans. The index is memoised against the project object,
 * which the store replaces on each edit, so it can never go stale.
 */
const openingIndexCache = new WeakMap<Project, Map<ID, Array<Door | WindowOpening>>>();

function openingIndex(project: Project): Map<ID, Array<Door | WindowOpening>> {
  const cached = openingIndexCache.get(project);
  if (cached) return cached;
  const index = new Map<ID, Array<Door | WindowOpening>>();
  for (const id of project.order) {
    const e = project.entities[id];
    if (!e || (e.type !== 'door' && e.type !== 'window')) continue;
    const list = index.get(e.wallId);
    if (list) list.push(e);
    else index.set(e.wallId, [e]);
  }
  openingIndexCache.set(project, index);
  return index;
}

const NO_OPENINGS: Array<Door | WindowOpening> = [];

export function openingsOnWall(project: Project, wallId: ID): Array<Door | WindowOpening> {
  return openingIndex(project).get(wallId) ?? NO_OPENINGS;
}

export function roomMetrics(room: Room): { area: number; perimeter: number } {
  return { area: polygonArea(room.polygon), perimeter: polygonPerimeter(room.polygon) };
}

/** All entities in the same group as `id`, including `id` itself. */
export function expandGroupSelection(project: Project, ids: ID[]): ID[] {
  const out = new Set<ID>();
  for (const id of ids) {
    const e = project.entities[id];
    if (!e) continue;
    out.add(id);
    if (e.groupId) {
      const g = project.groups[e.groupId];
      if (g) for (const m of g.memberIds) if (project.entities[m]) out.add(m);
    }
  }
  return [...out];
}
