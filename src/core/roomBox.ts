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
    wallIds.forEach((id, i) => {
      const wall = entities[id];
      if (wall && wall.type === 'wall') entities[id] = { ...wall, a: segs[i][0], b: segs[i][1] };
    });
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
