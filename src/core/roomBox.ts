import type { ID, Plot, Project, Room, Vec2, Wall } from '@/types';
import { uid } from './id';
import { rectFromPoints, type Rect } from './geometry';
import { layerIdFor } from '@/state/project';
import { classifyRoom, defaultRoomName, roomColor } from './rooms';

/** How close two coordinates must be to count as the same edge (mm). */
const RECT_TOL = 1;

/**
 * The axis-aligned rectangle a room occupies, or null when it is a non-
 * rectangular shape.
 *
 * Numeric width/height/area editing only makes sense for rectangles; anything
 * else has to be edited by dragging its walls, and the inspector says so.
 */
export function roomRect(room: Room): Rect | null {
  const poly = room.polygon;
  if (poly.length !== 4) return null;
  const r = rectFromPoints(poly);
  // Every vertex must sit on a corner of the bounding box.
  for (const p of poly) {
    const onX = Math.abs(p.x - r.x) <= RECT_TOL || Math.abs(p.x - (r.x + r.w)) <= RECT_TOL;
    const onY = Math.abs(p.y - r.y) <= RECT_TOL || Math.abs(p.y - (r.y + r.h)) <= RECT_TOL;
    if (!onX || !onY) return null;
  }
  return r;
}

export function isRectangular(room: Room): boolean {
  return roomRect(room) !== null;
}

/** Clockwise polygon for a rectangle, in the winding rooms are stored with. */
export function polygonOfRect(r: Rect): Vec2[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
}

/* ------------------------------------------------------------- the plot */

export function findPlot(project: Project): Plot | null {
  for (const id of project.order) {
    const e = project.entities[id];
    if (e && e.type === 'plot') return e;
  }
  return null;
}

export function plotRect(plot: Plot): Rect {
  return { x: plot.x, y: plot.y, w: plot.width, h: plot.height };
}

/**
 * Clamp a rectangle so it sits inside the plot.
 *
 * Size is reduced only when the rectangle genuinely cannot fit; otherwise the
 * rectangle is slid inwards, which is what a user dragging near the boundary
 * expects — the shape they drew keeps its dimensions.
 */
export function clampRectToPlot(r: Rect, plot: Plot | null): Rect {
  if (!plot) return r;
  const p = plotRect(plot);
  const w = Math.min(r.w, p.w);
  const h = Math.min(r.h, p.h);
  return {
    w,
    h,
    x: Math.min(Math.max(r.x, p.x), p.x + p.w - w),
    y: Math.min(Math.max(r.y, p.y), p.y + p.h - h),
  };
}

/** Clamp a bare point into the plot. */
export function clampPointToPlot(pt: Vec2, plot: Plot | null): Vec2 {
  if (!plot) return pt;
  const p = plotRect(plot);
  return {
    x: Math.min(Math.max(pt.x, p.x), p.x + p.w),
    y: Math.min(Math.max(pt.y, p.y), p.y + p.h),
  };
}

/* --------------------------------------------------- building a room box */

export interface RoomBoxOptions {
  /** Inner clear rectangle the room should occupy. */
  rect: Rect;
  name?: string;
  roomType?: Room['roomType'];
  wallThickness: number;
  wallHeight: number;
}

/**
 * Create a rectangular room together with the four walls that enclose it.
 *
 * The walls' centrelines sit half a thickness *outside* the rectangle, so the
 * number the user typed is the clear internal dimension — which is how room
 * sizes are quoted, and it means the reported area matches the input exactly.
 */
export function buildRoomBox(
  project: Project,
  opts: RoomBoxOptions,
): { room: Room; walls: Wall[] } {
  const { rect, wallThickness: t, wallHeight } = opts;
  const half = t / 2;
  const wallLayer = layerIdFor(project, 'walls');
  const roomLayer = layerIdFor(project, 'rooms');

  const x0 = rect.x - half;
  const y0 = rect.y - half;
  const x1 = rect.x + rect.w + half;
  const y1 = rect.y + rect.h + half;

  const corners: Array<[Vec2, Vec2]> = [
    [{ x: x0, y: y0 }, { x: x1, y: y0 }],
    [{ x: x1, y: y0 }, { x: x1, y: y1 }],
    [{ x: x1, y: y1 }, { x: x0, y: y1 }],
    [{ x: x0, y: y1 }, { x: x0, y: y0 }],
  ];

  const walls: Wall[] = corners.map(([a, b]) => ({
    id: uid('wall'),
    type: 'wall',
    layerId: wallLayer,
    a,
    b,
    bulge: 0,
    thickness: t,
    height: wallHeight,
    material: project.wallDefaults.material,
    exterior: false,
    locked: false,
    hidden: false,
  }));

  const polygon = polygonOfRect(rect);
  const roomType = opts.roomType ?? classifyRoom(polygon);
  const existing: string[] = [];
  for (const id of project.order) {
    const e = project.entities[id];
    if (e && e.type === 'room') existing.push(e.name);
  }

  const room: Room = {
    id: uid('room'),
    type: 'room',
    layerId: roomLayer,
    polygon,
    name: opts.name ?? defaultRoomName(roomType, existing),
    roomType,
    auto: false,
    renamed: !!opts.name,
    floorFinish: 'Tile',
    wallFinish: 'Paint',
    ceilingHeight: wallHeight,
    color: roomColor(roomType),
    locked: false,
    hidden: false,
    wallIds: walls.map((w) => w.id),
  };

  return { room, walls };
}

/**
 * Resize a rectangular room to a new clear size, moving its own walls with it.
 *
 * `anchor` decides which corner stays put — top-left by default, so typing a
 * new width grows the room to the right rather than shifting it bodily.
 */
export function resizeRoomBox(
  project: Project,
  roomId: ID,
  size: { w?: number; h?: number },
  anchor: 'topleft' | 'center' = 'topleft',
): Project {
  const room = project.entities[roomId];
  if (!room || room.type !== 'room') return project;
  const cur = roomRect(room);
  if (!cur) return project;

  const w = Math.max(300, size.w ?? cur.w);
  const h = Math.max(300, size.h ?? cur.h);

  let next: Rect;
  if (anchor === 'center') {
    next = { x: cur.x + (cur.w - w) / 2, y: cur.y + (cur.h - h) / 2, w, h };
  } else {
    next = { x: cur.x, y: cur.y, w, h };
  }
  next = clampRectToPlot(next, findPlot(project));

  return applyRoomRect(project, roomId, next);
}

/** Move/resize a rectangular room to an exact rectangle, walls included. */
export function applyRoomRect(project: Project, roomId: ID, rect: Rect): Project {
  const room = project.entities[roomId];
  if (!room || room.type !== 'room') return project;

  const entities = { ...project.entities, [roomId]: { ...room, polygon: polygonOfRect(rect) } };

  const wallIds = room.wallIds ?? [];
  if (wallIds.length === 4) {
    const first = entities[wallIds[0]];
    const t = first && first.type === 'wall' ? first.thickness : project.wallDefaults.interiorThickness;
    const half = t / 2;
    const x0 = rect.x - half;
    const y0 = rect.y - half;
    const x1 = rect.x + rect.w + half;
    const y1 = rect.y + rect.h + half;
    const segs: Array<[Vec2, Vec2]> = [
      [{ x: x0, y: y0 }, { x: x1, y: y0 }],
      [{ x: x1, y: y0 }, { x: x1, y: y1 }],
      [{ x: x1, y: y1 }, { x: x0, y: y1 }],
      [{ x: x0, y: y1 }, { x: x0, y: y0 }],
    ];
    // A wall shared with another room must not be dragged along by this one.
    // Where the geometry actually changes, this room gets its own copy and the
    // neighbour keeps the original — the two simply stop being one wall.
    const sharedWith = new Map<ID, number>();
    for (const id of project.order) {
      const e = project.entities[id];
      if (!e || e.type !== 'room' || !e.wallIds) continue;
      for (const w of e.wallIds) sharedWith.set(w, (sharedWith.get(w) ?? 0) + 1);
    }

    const nextWallIds = [...wallIds];
    const added: ID[] = [];
    wallIds.forEach((id, i) => {
      const wall = entities[id];
      if (!wall || wall.type !== 'wall') return;
      const [a, b] = segs[i];
      const unchanged =
        Math.abs(wall.a.x - a.x) < 0.5 &&
        Math.abs(wall.a.y - a.y) < 0.5 &&
        Math.abs(wall.b.x - b.x) < 0.5 &&
        Math.abs(wall.b.y - b.y) < 0.5;
      if (unchanged) return;

      if ((sharedWith.get(id) ?? 1) > 1) {
        const clone: Wall = { ...wall, id: uid('wall'), a, b };
        entities[clone.id] = clone;
        nextWallIds[i] = clone.id;
        added.push(clone.id);
      } else {
        entities[id] = { ...wall, a, b };
      }
    });

    if (added.length > 0) {
      const r = entities[roomId];
      if (r && r.type === 'room') entities[roomId] = { ...r, wallIds: nextWallIds };
      return { ...project, entities, order: [...project.order, ...added] };
    }
  }

  return { ...project, entities };
}

/**
 * Resize a room to a target area in mm², keeping its current proportions.
 * Lets a user think in "I need 120 sq ft" rather than in two edge lengths.
 */
export function setRoomArea(project: Project, roomId: ID, areaMM2: number): Project {
  const room = project.entities[roomId];
  if (!room || room.type !== 'room') return project;
  const cur = roomRect(room);
  if (!cur || cur.w <= 0 || cur.h <= 0 || areaMM2 <= 0) return project;
  const factor = Math.sqrt(areaMM2 / (cur.w * cur.h));
  return resizeRoomBox(project, roomId, { w: cur.w * factor, h: cur.h * factor });
}

/** Translate a room box and the walls it owns. */
export function moveRoomBox(project: Project, roomId: ID, delta: Vec2): Project {
  const room = project.entities[roomId];
  if (!room || room.type !== 'room') return project;
  const cur = roomRect(room);
  if (!cur) return project;
  const moved = clampRectToPlot(
    { x: cur.x + delta.x, y: cur.y + delta.y, w: cur.w, h: cur.h },
    findPlot(project),
  );
  return applyRoomRect(project, roomId, moved);
}

/* ------------------------------------------------- snapping rooms together */

export interface RectSnap {
  rect: Rect;
  /** Guide lines to draw for the edges that latched on. */
  guides: Array<{ a: Vec2; b: Vec2 }>;
  /** Whether an axis latched onto a neighbour, so the caller can skip the grid. */
  snappedX: boolean;
  snappedY: boolean;
}

interface EdgeCandidate {
  value: number;
  /** Span of the neighbour along the perpendicular axis, for drawing a guide. */
  from: number;
  to: number;
}

/**
 * Align a room rectangle to its neighbours.
 *
 * Two rooms placed side by side should share one wall, not stack two. Because a
 * room rectangle is its *clear* internal size, sharing a wall means leaving
 * exactly one wall thickness between the two rectangles — so that is the
 * candidate offered, alongside flush alignment of the parallel edges. Each of
 * the four edges snaps independently, which handles both dragging a new
 * rectangle out and nudging an existing room into place.
 */
export function snapRoomRect(
  project: Project,
  rect: Rect,
  opts: { tolerance: number; wallThickness: number; excludeIds?: Set<ID> },
): RectSnap {
  const { tolerance: tol, wallThickness: t } = opts;
  const exclude = opts.excludeIds ?? new Set<ID>();

  // Candidates are kept per moving edge, because which alignments make sense
  // depends on the edge. Aligning two left edges is always meaningful; aligning
  // this room's right edge to another's left edge only means something when the
  // two actually sit alongside each other, otherwise a near-miss in an
  // unrelated part of the plan hijacks the placement.
  const leftC: EdgeCandidate[] = [];
  const rightC: EdgeCandidate[] = [];
  const topC: EdgeCandidate[] = [];
  const bottomC: EdgeCandidate[] = [];

  const overlaps = (aFrom: number, aTo: number, bFrom: number, bTo: number) =>
    Math.min(aTo, bTo) - Math.max(aFrom, bFrom) > Math.max(t, 1);

  for (const id of project.order) {
    const e = project.entities[id];
    if (!e || exclude.has(id) || e.hidden) continue;

    if (e.type === 'room') {
      const r = roomRect(e);
      if (!r) continue;
      const spanY = { from: r.y, to: r.y + r.h };
      const spanX = { from: r.x, to: r.x + r.w };
      const sideBySide = overlaps(rect.y, rect.y + rect.h, r.y, r.y + r.h);
      const stacked = overlaps(rect.x, rect.x + rect.w, r.x, r.x + r.w);

      // Same-side alignment: a row of rooms flush along one edge.
      leftC.push({ value: r.x, ...spanY });
      rightC.push({ value: r.x + r.w, ...spanY });
      topC.push({ value: r.y, ...spanX });
      bottomC.push({ value: r.y + r.h, ...spanX });

      if (sideBySide) {
        // Share a vertical wall with the room beside this one.
        leftC.push({ value: r.x + r.w + t, ...spanY });
        rightC.push({ value: r.x - t, ...spanY });
        // Butt the edges together without a wall between (rare, but legal).
        leftC.push({ value: r.x + r.w, ...spanY });
        rightC.push({ value: r.x, ...spanY });
      }
      if (stacked) {
        // Share a horizontal wall with the room above or below.
        topC.push({ value: r.y + r.h + t, ...spanX });
        bottomC.push({ value: r.y - t, ...spanX });
        topC.push({ value: r.y + r.h, ...spanX });
        bottomC.push({ value: r.y, ...spanX });
      }
    } else if (e.type === 'plot') {
      // Against the plot the room sits on, or just inside, the boundary.
      const spanY = { from: e.y, to: e.y + e.height };
      const spanX = { from: e.x, to: e.x + e.width };
      leftC.push({ value: e.x, ...spanY }, { value: e.x + t / 2, ...spanY });
      rightC.push(
        { value: e.x + e.width, ...spanY },
        { value: e.x + e.width - t / 2, ...spanY },
      );
      topC.push({ value: e.y, ...spanX }, { value: e.y + t / 2, ...spanX });
      bottomC.push(
        { value: e.y + e.height, ...spanX },
        { value: e.y + e.height - t / 2, ...spanX },
      );
    }
  }

  const guides: RectSnap['guides'] = [];
  let { x, y, w, h } = rect;
  let snappedX = false;
  let snappedY = false;

  const best = (target: number, list: EdgeCandidate[]): EdgeCandidate | null => {
    let win: EdgeCandidate | null = null;
    let bestD = tol;
    for (const c of list) {
      const d = Math.abs(c.value - target);
      if (d < bestD) {
        bestD = d;
        win = c;
      }
    }
    return win;
  };

  const left = best(x, leftC);
  const right = best(x + w, rightC);
  if (left && (!right || Math.abs(left.value - x) <= Math.abs(right.value - (x + w)))) {
    x = left.value;
    snappedX = true;
    guides.push({ a: { x, y: Math.min(left.from, y) }, b: { x, y: Math.max(left.to, y + h) } });
  } else if (right) {
    x = right.value - w;
    snappedX = true;
    guides.push({
      a: { x: right.value, y: Math.min(right.from, y) },
      b: { x: right.value, y: Math.max(right.to, y + h) },
    });
  }

  const top = best(y, topC);
  const bottom = best(y + h, bottomC);
  if (top && (!bottom || Math.abs(top.value - y) <= Math.abs(bottom.value - (y + h)))) {
    y = top.value;
    snappedY = true;
    guides.push({ a: { x: Math.min(top.from, x), y }, b: { x: Math.max(top.to, x + w), y } });
  } else if (bottom) {
    y = bottom.value - h;
    snappedY = true;
    guides.push({
      a: { x: Math.min(bottom.from, x), y: bottom.value },
      b: { x: Math.max(bottom.to, x + w), y: bottom.value },
    });
  }

  return { rect: { x, y, w, h }, guides, snappedX, snappedY };
}

/** Screen pixels within which a room latches onto a neighbour. Generous on
 *  purpose: sharing a wall is almost always the intent, and the grid can never
 *  land on it because wall thickness is not a whole number of feet. */
export const ROOM_SNAP_PX = 20;

/**
 * Place a room rectangle: neighbours first, grid only as a fallback.
 *
 * The order matters. Snapping to the grid first and to neighbours second can
 * never produce a shared wall, because a grid step is a whole foot and a wall
 * is four inches — the two are incommensurable, so the room always lands a
 * fraction of a foot from its neighbour. Neighbours therefore win, and the grid
 * is applied only on the axes that found nothing to latch onto.
 */
export function placeRoomRect(
  project: Project,
  rawRect: Rect,
  opts: { worldPerPx: number; wallThickness: number; snapEnabled: boolean; gridSize: number; excludeIds?: Set<ID> },
): RectSnap {
  if (!opts.snapEnabled) return { rect: rawRect, guides: [], snappedX: false, snappedY: false };

  // The snap range is never allowed below three quarters of a grid step.
  // A wall is four inches and a grid step is a foot, so a room that lands on a
  // grid line is always a fraction of a foot from the shared-wall position;
  // unless the snap can reach across that fraction, perfect adjacency is
  // unreachable no matter how carefully the user drags.
  const tolerance = Math.max(ROOM_SNAP_PX * opts.worldPerPx, opts.gridSize * 0.75);
  const fit = snapRoomRect(project, rawRect, {
    tolerance,
    wallThickness: opts.wallThickness,
    excludeIds: opts.excludeIds,
  });

  const g = opts.gridSize;
  const rect = { ...fit.rect };
  if (!fit.snappedX && g > 0) {
    const x = Math.round(rect.x / g) * g;
    rect.w = Math.max(g, Math.round((rect.x + rect.w) / g) * g - x);
    rect.x = x;
  }
  if (!fit.snappedY && g > 0) {
    const y = Math.round(rect.y / g) * g;
    rect.h = Math.max(g, Math.round((rect.y + rect.h) / g) * g - y);
    rect.y = y;
  }
  return { ...fit, rect };
}
