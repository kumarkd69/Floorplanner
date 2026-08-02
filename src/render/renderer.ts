import type {
  Door,
  Dimension,
  Plot,
  Entity,
  Furniture,
  ID,
  Layer,
  Project,
  Room,
  SnapResult,
  TextNote,
  UIState,
  Vec2,
  Viewport,
  Wall,
  WindowOpening,
} from '@/types';
import {
  add,
  angleOf,
  dist,
  mid,
  mul,
  normalize,
  polygonLabelPoint,
  rectFromCorners,
  rectFromPoints,
  rotate,
  sub,
  type Rect,
} from '@/core/geometry';
import {
  entityBounds,
  furnitureCorners,
  openingPlacement,
  openingsOnWall,
  roomMetrics,
  selectionBounds,
  wallCenterline,
  wallLength,
  wallOutline,
} from '@/core/entities';
import { CATALOG_BY_ID } from '@/data/catalog';
import { formatArea, formatLength, niceGridStep } from '@/core/units';
import { MATERIAL_FILL, getTheme, type RenderTheme } from './theme';

/** Screen-space size of the square handles on a selection. */
export const HANDLE_PX = 7;

/**
 * Level-of-detail threshold, in screen pixels of an object's longest side.
 * Smaller than this, a furniture symbol reads as a plain box no matter how it
 * is drawn, so it degrades to its footprint and joins a batched path.
 */
export const LOD_DETAIL_PX = 16;
export const ROTATE_HANDLE_OFFSET_PX = 28;

export interface DraftPreview {
  kind: 'wall' | 'room' | 'dimension' | 'measure' | 'furniture';
  points: Vec2[];
  bulge?: number;
  thickness?: number;
  catalogId?: string;
  rotation?: number;
  /** Text to show at the cursor, e.g. a live length. */
  label?: string;
  valid?: boolean;
}

export interface Overlay {
  draft?: DraftPreview | null;
  marquee?: { a: Vec2; b: Vec2 } | null;
  snap?: SnapResult | null;
  guides?: Array<{ a: Vec2; b: Vec2 }>;
  /** Live measurement callouts drawn near the cursor during a drag. */
  callouts?: Array<{ at: Vec2; text: string }>;
  /** Wall id currently accepting a door/window drop. */
  hostWallId?: ID | null;
  cursor?: Vec2 | null;
}

export interface RenderInput {
  ctx: CanvasRenderingContext2D;
  width: number; // CSS px
  height: number; // CSS px
  dpr: number;
  project: Project;
  ui: UIState;
  viewport: Viewport;
  overlay: Overlay;
  /** Print/export mode disables interactive chrome. */
  presentation?: boolean;
}

/* ------------------------------------------------------------ transforms */

export function worldToScreen(p: Vec2, vp: Viewport): Vec2 {
  return { x: (p.x - vp.x) * vp.scale, y: (p.y - vp.y) * vp.scale };
}

export function screenToWorld(p: Vec2, vp: Viewport): Vec2 {
  return { x: p.x / vp.scale + vp.x, y: p.y / vp.scale + vp.y };
}

/** The world-space rectangle currently visible, used for culling. */
export function visibleRect(vp: Viewport, width: number, height: number, pad = 0): Rect {
  return {
    x: vp.x - pad / vp.scale,
    y: vp.y - pad / vp.scale,
    w: width / vp.scale + (2 * pad) / vp.scale,
    h: height / vp.scale + (2 * pad) / vp.scale,
  };
}

/* ---------------------------------------------------------------- helpers */

/** Layer lookup by id, memoised per project — the renderer hits it per entity. */
const layerMapCache = new WeakMap<Project, Map<ID, Layer>>();

function layerMap(project: Project): Map<ID, Layer> {
  const cached = layerMapCache.get(project);
  if (cached) return cached;
  const map = new Map(project.layers.map((l) => [l.id, l]));
  layerMapCache.set(project, map);
  return map;
}

function layerAlpha(project: Project, e: Entity): number {
  return layerMap(project).get(e.layerId)?.opacity ?? 1;
}

function isEntityVisible(project: Project, e: Entity): boolean {
  if (e.hidden) return false;
  const layer = layerMap(project).get(e.layerId);
  return !layer || layer.visible;
}

/**
 * Entity ids in paint order: layer stack first, document order within a layer.
 *
 * Memoised against the project object because the store replaces it on every
 * change — so this is computed once per edit rather than once per frame, and a
 * static scene costs nothing to re-sort while panning.
 */
const paintOrderCache = new WeakMap<Project, ID[]>();

function paintOrder(project: Project): ID[] {
  const cached = paintOrderCache.get(project);
  if (cached) return cached;

  const layerRank = new Map<ID, number>();
  project.layers.forEach((l, i) => layerRank.set(l.id, i));
  // Precomputed document positions: looking these up with `indexOf` inside the
  // comparator would make sorting quadratic on large plans.
  const docIndex = new Map<ID, number>();
  project.order.forEach((id, i) => docIndex.set(id, i));

  const sorted = [...project.order].sort((a, b) => {
    const ea = project.entities[a];
    const eb = project.entities[b];
    if (!ea || !eb) return 0;
    const ra = layerRank.get(ea.layerId) ?? 0;
    const rb = layerRank.get(eb.layerId) ?? 0;
    if (ra !== rb) return ra - rb;
    return (docIndex.get(a) ?? 0) - (docIndex.get(b) ?? 0);
  });

  paintOrderCache.set(project, sorted);
  return sorted;
}

/** A reusable offscreen canvas for punching openings out of walls. */
let punchCanvas: HTMLCanvasElement | null = null;

function getPunchCanvas(w: number, h: number): HTMLCanvasElement {
  if (!punchCanvas) punchCanvas = document.createElement('canvas');
  if (punchCanvas.width !== w || punchCanvas.height !== h) {
    punchCanvas.width = w;
    punchCanvas.height = h;
  }
  return punchCanvas;
}

/* ------------------------------------------------------------------ main */

export function render(input: RenderInput): void {
  const { ctx, width, height, dpr, project, ui, viewport } = input;
  const theme = getTheme(ui.theme, ui.highContrast);
  const px = 1 / viewport.scale; // one screen pixel, in world mm

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  // World transform: everything below draws in millimetres.
  ctx.save();
  ctx.setTransform(
    viewport.scale * dpr,
    0,
    0,
    viewport.scale * dpr,
    -viewport.x * viewport.scale * dpr,
    -viewport.y * viewport.scale * dpr,
  );
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';

  const view = visibleRect(viewport, width, height, 64);

  if (ui.showGrid && !input.presentation) drawGrid(ctx, project, viewport, view, theme, px);
  if (!input.presentation) drawOrigin(ctx, theme, px);

  const order = paintOrder(project);

  // The plot is the ground everything sits on.
  for (const id of order) {
    const e = project.entities[id];
    if (!e || e.type !== 'plot' || !isEntityVisible(project, e)) continue;
    drawPlot(ctx, e, theme, px, layerAlpha(project, e), ui);
  }

  // Rooms first — they are the floor.
  for (const id of order) {
    const e = project.entities[id];
    if (!e || e.type !== 'room' || !isEntityVisible(project, e)) continue;
    if (!intersects(entityBounds(e, project), view)) continue;
    drawRoom(ctx, e, theme, px, layerAlpha(project, e));
  }

  drawWallsWithOpenings(ctx, project, order, view, theme, px, dpr, viewport, width, height);

  // Openings, furniture, dimensions, text.
  //
  // Level of detail: symbols smaller than a few pixels are collected and filled
  // as one batched path instead of running their full drawing routine. Zoomed
  // out over a large site this is the difference between ~5,000 path programs
  // per frame and one — and at that size the detail is invisible anyway.
  const tiny: Furniture[] = [];

  for (const id of order) {
    const e = project.entities[id];
    if (!e || !isEntityVisible(project, e)) continue;
    const b = entityBounds(e, project);
    if (!intersects(b, view)) continue;
    const alpha = layerAlpha(project, e);
    if (e.type === 'door') drawDoor(ctx, e, project, theme, px, alpha);
    else if (e.type === 'window') drawWindow(ctx, e, project, theme, px, alpha);
    else if (e.type === 'furniture') {
      const screenSize = Math.max(e.width, e.depth) * viewport.scale;
      if (screenSize < LOD_DETAIL_PX) tiny.push(e);
      else drawFurniture(ctx, e, theme, px, alpha);
    } else if (e.type === 'dimension' && ui.showDimensions) {
      drawDimension(ctx, e, project, theme, px, alpha);
    } else if (e.type === 'text') {
      drawText(ctx, e, theme, alpha);
    }
  }

  if (tiny.length > 0) drawFurnitureBatch(ctx, tiny, theme);

  if (ui.showRoomLabels) {
    for (const id of order) {
      const e = project.entities[id];
      if (!e || e.type !== 'room' || !isEntityVisible(project, e)) continue;
      if (!intersects(entityBounds(e, project), view)) continue;
      drawRoomLabel(ctx, e, project, theme, px, layerAlpha(project, e));
      if (ui.showDimensions) {
        drawRoomDimensions(ctx, e, theme, px, layerAlpha(project, e), viewport.scale);
      }
    }
  }

  if (ui.showDimensions && !input.presentation) {
    drawWallLengths(ctx, project, order, view, theme, px, viewport);
  }

  if (!input.presentation) {
    drawOverlay(ctx, input, theme, px);
    drawSelection(ctx, project, ui, theme, px);
  }

  ctx.restore();
}

function intersects(a: Rect, b: Rect): boolean {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

/* ------------------------------------------------------------------ grid */

function drawGrid(
  ctx: CanvasRenderingContext2D,
  project: Project,
  vp: Viewport,
  view: Rect,
  theme: RenderTheme,
  px: number,
) {
  // Choose a spacing that never draws lines closer than 8 screen px.
  const minor = Math.max(project.gridSize, niceGridStep(project.unit, 8, vp.scale));
  const major = minor * (project.unit === 'ft' || project.unit === 'in' ? 5 : 5);

  const x0 = Math.floor(view.x / minor) * minor;
  const y0 = Math.floor(view.y / minor) * minor;
  const x1 = view.x + view.w;
  const y1 = view.y + view.h;

  ctx.lineWidth = px;
  ctx.strokeStyle = theme.gridMinor;
  ctx.beginPath();
  for (let x = x0; x <= x1; x += minor) {
    if (Math.abs(x % major) < 1e-6) continue;
    ctx.moveTo(x, view.y);
    ctx.lineTo(x, y1);
  }
  for (let y = y0; y <= y1; y += minor) {
    if (Math.abs(y % major) < 1e-6) continue;
    ctx.moveTo(view.x, y);
    ctx.lineTo(x1, y);
  }
  ctx.stroke();

  ctx.strokeStyle = theme.gridMajor;
  ctx.beginPath();
  for (let x = Math.floor(view.x / major) * major; x <= x1; x += major) {
    ctx.moveTo(x, view.y);
    ctx.lineTo(x, y1);
  }
  for (let y = Math.floor(view.y / major) * major; y <= y1; y += major) {
    ctx.moveTo(view.x, y);
    ctx.lineTo(x1, y);
  }
  ctx.stroke();
}

function drawOrigin(ctx: CanvasRenderingContext2D, theme: RenderTheme, px: number) {
  const r = 14 * px;
  ctx.strokeStyle = theme.axis;
  ctx.lineWidth = 1.5 * px;
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.lineTo(r, 0);
  ctx.moveTo(0, -r);
  ctx.lineTo(0, r);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 4 * px, 0, Math.PI * 2);
  ctx.stroke();
}

/* ------------------------------------------------------------------ rooms */

function drawRoom(
  ctx: CanvasRenderingContext2D,
  room: Room,
  theme: RenderTheme,
  px: number,
  alpha: number,
) {
  if (room.polygon.length < 3) return;
  ctx.save();
  ctx.globalAlpha = alpha * theme.roomFillAlpha;
  ctx.fillStyle = room.color;
  ctx.beginPath();
  ctx.moveTo(room.polygon[0].x, room.polygon[0].y);
  for (let i = 1; i < room.polygon.length; i++) ctx.lineTo(room.polygon[i].x, room.polygon[i].y);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = theme.roomStroke;
  ctx.lineWidth = px;
  ctx.stroke();
  ctx.restore();
}

/**
 * Room name and area, drawn in a final pass over everything else.
 *
 * Labels have to sit above furniture: a bed or a kitchen island parked over the
 * centroid would otherwise hide the one piece of information every reader of a
 * floor plan looks for first.
 */
function drawRoomLabel(
  ctx: CanvasRenderingContext2D,
  room: Room,
  project: Project,
  theme: RenderTheme,
  px: number,
  alpha: number,
) {
  const c = polygonLabelPoint(room.polygon);
  const { area } = roomMetrics(room);
  // Skip labels that would be illegible at this zoom.
  const screenArea = area / (px * px);
  if (screenArea < 6000) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const nameSize = Math.min(Math.max(13 * px, 220), 420);
  const areaText = formatArea(area, project.unit);

  ctx.font = `600 ${nameSize}px Inter, system-ui, sans-serif`;
  const nameWidth = ctx.measureText(room.name).width;
  ctx.font = `${nameSize * 0.8}px Inter, system-ui, sans-serif`;
  const areaWidth = ctx.measureText(areaText).width;

  // A soft plate keeps the text readable over whatever it lands on.
  const boxW = Math.max(nameWidth, areaWidth) + nameSize * 0.7;
  const boxH = nameSize * 2.3;
  ctx.globalAlpha = alpha * 0.72;
  ctx.fillStyle = theme.background;
  ctx.beginPath();
  ctx.roundRect(c.x - boxW / 2, c.y - boxH / 2, boxW, boxH, nameSize * 0.28);
  ctx.fill();

  ctx.globalAlpha = alpha;
  ctx.fillStyle = theme.roomLabel;
  ctx.font = `600 ${nameSize}px Inter, system-ui, sans-serif`;
  ctx.fillText(room.name, c.x, c.y - nameSize * 0.45);
  ctx.fillStyle = theme.roomSubLabel;
  ctx.font = `${nameSize * 0.8}px Inter, system-ui, sans-serif`;
  ctx.fillText(areaText, c.x, c.y + nameSize * 0.6);
  ctx.restore();
}

/**
 * The plot boundary: a hatched margin outside a clear interior, with its size
 * called out on each edge. Drawn as a band rather than a fill so it reads as
 * "site limit" without tinting everything inside it.
 */
function drawPlot(
  ctx: CanvasRenderingContext2D,
  plot: Plot,
  theme: RenderTheme,
  px: number,
  alpha: number,
  ui: UIState,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = theme.dimension;
  ctx.fillStyle = theme.dimension;
  ctx.lineWidth = 2 * px;
  ctx.setLineDash([14 * px, 8 * px]);
  ctx.strokeRect(plot.x, plot.y, plot.width, plot.height);
  ctx.setLineDash([]);

  // Corner ticks, so the extents stay legible when zoomed out.
  const t = Math.min(plot.width, plot.height) * 0.04;
  ctx.lineWidth = 3 * px;
  for (const [cx, cy, sx, sy] of [
    [plot.x, plot.y, 1, 1],
    [plot.x + plot.width, plot.y, -1, 1],
    [plot.x + plot.width, plot.y + plot.height, -1, -1],
    [plot.x, plot.y + plot.height, 1, -1],
  ] as Array<[number, number, number, number]>) {
    ctx.beginPath();
    ctx.moveTo(cx + sx * t, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + sy * t);
    ctx.stroke();
  }

  if (ui.showDimensions) {
    const size = Math.min(Math.max(13 * px, 200), 500);
    ctx.font = `700 ${size}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    edgeLabel(ctx, formatLength(plot.width), { x: plot.x + plot.width / 2, y: plot.y - size }, theme, px, size, 0);
    edgeLabel(
      ctx,
      formatLength(plot.height),
      { x: plot.x - size, y: plot.y + plot.height / 2 },
      theme,
      px,
      size,
      -Math.PI / 2,
    );
    ctx.fillStyle = theme.roomSubLabel;
    ctx.font = `600 ${size * 0.85}px Inter, system-ui, sans-serif`;
    ctx.fillText(
      `${plot.name} · ${formatArea(plot.width * plot.height)}`,
      plot.x + plot.width / 2,
      plot.y + plot.height + size * 2.6,
    );
  }
  ctx.restore();
}

/** A dimension caption on a plate, drawn upright at any rotation. */
function edgeLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  at: Vec2,
  theme: RenderTheme,
  px: number,
  size: number,
  angle: number,
) {
  ctx.save();
  ctx.translate(at.x, at.y);
  let a = angle;
  if (a > Math.PI / 2 || a < -Math.PI / 2) a += Math.PI;
  ctx.rotate(a);
  const w = ctx.measureText(text).width;
  ctx.fillStyle = theme.background;
  ctx.globalAlpha = 0.88;
  ctx.beginPath();
  ctx.roundRect(-w / 2 - 5 * px, -size * 0.62, w + 10 * px, size * 1.24, 4 * px);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = theme.dimension;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/**
 * Width and height called out on a room's own edges.
 *
 * Every room carries its dimensions on the drawing, so a reader never has to
 * select something to find out how big it is.
 */
function drawRoomDimensions(
  ctx: CanvasRenderingContext2D,
  room: Room,
  theme: RenderTheme,
  px: number,
  alpha: number,
  scale: number,
) {
  const b = rectFromPoints(room.polygon);
  // Skip when the room is too small on screen for the text to fit.
  if (b.w * scale < 54 || b.h * scale < 34) return;
  const size = Math.min(Math.max(10 * px, 110), 260);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `600 ${size}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  edgeLabel(ctx, formatLength(b.w, undefined, { compact: true }), { x: b.x + b.w / 2, y: b.y + size * 0.9 }, theme, px, size, 0);
  edgeLabel(
    ctx,
    formatLength(b.h, undefined, { compact: true }),
    { x: b.x + size * 0.9, y: b.y + b.h / 2 },
    theme,
    px,
    size,
    -Math.PI / 2,
  );
  ctx.restore();
}

/* ------------------------------------------------------------------ walls */

/**
 * Walls are drawn into an offscreen layer so door/window openings can be
 * punched out with `destination-out`. Punching on the main canvas would erase
 * the room fill underneath; compositing a separate layer keeps the floor intact
 * and shows through the opening, which is what a real plan looks like.
 */
function drawWallsWithOpenings(
  ctx: CanvasRenderingContext2D,
  project: Project,
  order: ID[],
  view: Rect,
  theme: RenderTheme,
  px: number,
  dpr: number,
  vp: Viewport,
  width: number,
  height: number,
) {
  const walls: Wall[] = [];
  for (const id of order) {
    const e = project.entities[id];
    if (e && e.type === 'wall' && isEntityVisible(project, e) && intersects(entityBounds(e, project), view)) {
      walls.push(e);
    }
  }
  if (walls.length === 0) return;

  const cw = Math.max(1, Math.round(width * dpr));
  const chh = Math.max(1, Math.round(height * dpr));
  const layer = getPunchCanvas(cw, chh);
  const lctx = layer.getContext('2d');
  if (!lctx) return;

  lctx.setTransform(1, 0, 0, 1, 0, 0);
  lctx.clearRect(0, 0, cw, chh);
  lctx.setTransform(
    vp.scale * dpr,
    0,
    0,
    vp.scale * dpr,
    -vp.x * vp.scale * dpr,
    -vp.y * vp.scale * dpr,
  );
  lctx.lineJoin = 'round';

  for (const wall of walls) {
    const outline = wallOutline(wall);
    lctx.globalAlpha = layerAlpha(project, wall);
    lctx.beginPath();
    lctx.moveTo(outline[0].x, outline[0].y);
    for (let i = 1; i < outline.length; i++) lctx.lineTo(outline[i].x, outline[i].y);
    lctx.closePath();
    lctx.fillStyle = wall.material === 'glass' ? MATERIAL_FILL.glass : wall.exterior ? theme.wallExteriorFill : theme.wallFill;
    lctx.fill();
    lctx.strokeStyle = theme.wallStroke;
    lctx.lineWidth = 1.2 * px;
    lctx.stroke();
  }

  // Punch openings.
  lctx.globalAlpha = 1;
  lctx.globalCompositeOperation = 'destination-out';
  for (const wall of walls) {
    for (const op of openingsOnWall(project, wall.id)) {
      if (!isEntityVisible(project, op)) continue;
      const pl = openingPlacement(op, wall);
      const h = mul(pl.across, wall.thickness / 2 + 2 * px);
      lctx.beginPath();
      lctx.moveTo(pl.start.x + h.x, pl.start.y + h.y);
      lctx.lineTo(pl.end.x + h.x, pl.end.y + h.y);
      lctx.lineTo(pl.end.x - h.x, pl.end.y - h.y);
      lctx.lineTo(pl.start.x - h.x, pl.start.y - h.y);
      lctx.closePath();
      lctx.fill();
    }
  }
  lctx.globalCompositeOperation = 'source-over';

  // Composite the wall layer, then draw jambs on the main canvas so their
  // strokes are not punched away.
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.drawImage(layer, 0, 0, cw, chh, 0, 0, width, height);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = theme.wallStroke;
  ctx.lineWidth = 1.2 * px;
  for (const wall of walls) {
    for (const op of openingsOnWall(project, wall.id)) {
      if (!isEntityVisible(project, op)) continue;
      const pl = openingPlacement(op, wall);
      const h = mul(pl.across, wall.thickness / 2);
      ctx.beginPath();
      ctx.moveTo(pl.start.x + h.x, pl.start.y + h.y);
      ctx.lineTo(pl.start.x - h.x, pl.start.y - h.y);
      ctx.moveTo(pl.end.x + h.x, pl.end.y + h.y);
      ctx.lineTo(pl.end.x - h.x, pl.end.y - h.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ doors */

function drawDoor(
  ctx: CanvasRenderingContext2D,
  door: Door,
  project: Project,
  theme: RenderTheme,
  px: number,
  alpha: number,
) {
  const wall = project.entities[door.wallId];
  if (!wall || wall.type !== 'wall') return;
  const pl = openingPlacement(door, wall);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = theme.openingStroke;
  ctx.fillStyle = theme.openingFill;
  ctx.lineWidth = 1.2 * px;

  const dirSign = door.direction === 'in' ? 1 : -1;
  const swingSign = door.swing === 'left' ? 1 : -1;
  const hinge = door.swing === 'left' ? pl.start : pl.end;
  const leafLen = door.width;
  const along = mul(pl.along, swingSign);
  const across = mul(pl.across, dirSign);

  switch (door.kind) {
    case 'single':
    case 'pocket': {
      if (door.kind === 'pocket') {
        // Pocket door slides into the wall — show the concealed leaf dashed.
        ctx.setLineDash([6 * px, 5 * px]);
        ctx.beginPath();
        ctx.moveTo(pl.start.x, pl.start.y);
        ctx.lineTo(pl.start.x + along.x * -leafLen, pl.start.y + along.y * -leafLen);
        ctx.stroke();
        ctx.setLineDash([]);
        drawLeaf(ctx, pl.start, pl.end, wall.thickness * 0.35, theme, px);
        break;
      }
      drawSwing(ctx, hinge, along, across, leafLen, wall.thickness, theme, px);
      break;
    }
    case 'double':
    case 'french': {
      const half = leafLen / 2;
      drawSwing(ctx, pl.start, pl.along, across, half, wall.thickness, theme, px);
      drawSwing(ctx, pl.end, mul(pl.along, -1), across, half, wall.thickness, theme, px);
      if (door.kind === 'french') {
        // Glazed leaves get a centre mullion line.
        ctx.beginPath();
        ctx.moveTo(pl.center.x - across.x * 2 * px, pl.center.y - across.y * 2 * px);
        ctx.lineTo(pl.center.x + across.x * leafLen * 0.05, pl.center.y + across.y * leafLen * 0.05);
        ctx.stroke();
      }
      break;
    }
    case 'sliding': {
      const t = wall.thickness * 0.3;
      const off = mul(pl.across, t);
      drawLeaf(
        ctx,
        add(pl.start, off),
        add(mid(pl.start, pl.end), off),
        t,
        theme,
        px,
      );
      drawLeaf(
        ctx,
        sub(mid(pl.start, pl.end), off),
        sub(pl.end, off),
        t,
        theme,
        px,
      );
      break;
    }
    case 'folding': {
      // Concertina: four panels zig-zagging out of the opening.
      const panels = 4;
      const seg = leafLen / panels;
      let p = pl.start;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      for (let i = 0; i < panels; i++) {
        const dir = i % 2 === 0 ? 1 : -1;
        p = add(add(p, mul(pl.along, seg)), mul(across, (seg * 0.5 * dir) / 1));
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

function drawLeaf(
  ctx: CanvasRenderingContext2D,
  a: Vec2,
  b: Vec2,
  thickness: number,
  theme: RenderTheme,
  px: number,
) {
  const d = normalize(sub(b, a));
  const n = mul({ x: d.y, y: -d.x }, Math.max(thickness / 2, 2 * px));
  ctx.beginPath();
  ctx.moveTo(a.x + n.x, a.y + n.y);
  ctx.lineTo(b.x + n.x, b.y + n.y);
  ctx.lineTo(b.x - n.x, b.y - n.y);
  ctx.lineTo(a.x - n.x, a.y - n.y);
  ctx.closePath();
  ctx.fillStyle = theme.openingFill;
  ctx.fill();
  ctx.strokeStyle = theme.openingStroke;
  ctx.stroke();
}

function drawSwing(
  ctx: CanvasRenderingContext2D,
  hinge: Vec2,
  along: Vec2,
  across: Vec2,
  leafLen: number,
  wallThickness: number,
  theme: RenderTheme,
  px: number,
) {
  const openDir = normalize(across);
  const tip = add(hinge, mul(openDir, leafLen));
  drawLeaf(ctx, hinge, tip, wallThickness * 0.32, theme, px);

  const a0 = angleOf(mul(openDir, 1));
  const a1 = angleOf(along);
  ctx.save();
  ctx.setLineDash([5 * px, 4 * px]);
  ctx.lineWidth = px;
  ctx.strokeStyle = theme.openingStroke;
  ctx.beginPath();
  // Draw the shorter sweep between the closed and open positions.
  let delta = a1 - a0;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  ctx.arc(hinge.x, hinge.y, leafLen, a0, a0 + delta, delta < 0);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/* ---------------------------------------------------------------- windows */

function drawWindow(
  ctx: CanvasRenderingContext2D,
  win: WindowOpening,
  project: Project,
  theme: RenderTheme,
  px: number,
  alpha: number,
) {
  const wall = project.entities[win.wallId];
  if (!wall || wall.type !== 'wall') return;
  const pl = openingPlacement(win, wall);
  const t = wall.thickness;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = theme.openingStroke;
  ctx.lineWidth = 1.1 * px;

  const frameOff = mul(pl.across, t / 2);
  // Frame: both faces of the wall.
  for (const s of [1, -1]) {
    const o = mul(frameOff, s);
    ctx.beginPath();
    ctx.moveTo(pl.start.x + o.x, pl.start.y + o.y);
    ctx.lineTo(pl.end.x + o.x, pl.end.y + o.y);
    ctx.stroke();
  }

  switch (win.kind) {
    case 'fixed':
    case 'casement':
    case 'awning': {
      // Single glazing line down the centre.
      ctx.beginPath();
      ctx.moveTo(pl.start.x, pl.start.y);
      ctx.lineTo(pl.end.x, pl.end.y);
      ctx.stroke();
      if (win.kind !== 'fixed') {
        // Opening indicator: a dashed triangle pointing to the hinge side.
        const apex = add(pl.center, mul(pl.across, win.kind === 'casement' ? t * 1.6 : -t * 1.6));
        ctx.setLineDash([5 * px, 4 * px]);
        ctx.beginPath();
        ctx.moveTo(pl.start.x, pl.start.y);
        ctx.lineTo(apex.x, apex.y);
        ctx.lineTo(pl.end.x, pl.end.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      break;
    }
    case 'sliding': {
      const o = mul(pl.across, t * 0.18);
      ctx.beginPath();
      ctx.moveTo(pl.start.x + o.x, pl.start.y + o.y);
      ctx.lineTo(pl.center.x + o.x, pl.center.y + o.y);
      ctx.moveTo(pl.center.x - o.x, pl.center.y - o.y);
      ctx.lineTo(pl.end.x - o.x, pl.end.y - o.y);
      ctx.stroke();
      break;
    }
    case 'bay': {
      const out = mul(pl.across, win.width * 0.35);
      const inset = mul(pl.along, win.width * 0.25);
      ctx.beginPath();
      ctx.moveTo(pl.start.x, pl.start.y);
      ctx.lineTo(pl.start.x + inset.x + out.x, pl.start.y + inset.y + out.y);
      ctx.lineTo(pl.end.x - inset.x + out.x, pl.end.y - inset.y + out.y);
      ctx.lineTo(pl.end.x, pl.end.y);
      ctx.stroke();
      break;
    }
    case 'corner': {
      ctx.beginPath();
      ctx.moveTo(pl.start.x, pl.start.y);
      ctx.lineTo(pl.end.x, pl.end.y);
      ctx.stroke();
      const o = mul(pl.across, t * 0.9);
      ctx.setLineDash([4 * px, 4 * px]);
      ctx.beginPath();
      ctx.moveTo(pl.end.x, pl.end.y);
      ctx.lineTo(pl.end.x + o.x, pl.end.y + o.y);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
  }
  ctx.restore();
}

/* -------------------------------------------------------------- furniture */

function drawFurniture(
  ctx: CanvasRenderingContext2D,
  f: Furniture,
  theme: RenderTheme,
  px: number,
  alpha: number,
) {
  const item = CATALOG_BY_ID.get(f.catalogId);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(f.position.x, f.position.y);
  ctx.rotate(f.rotation);
  ctx.scale(f.flipX ? -1 : 1, f.flipY ? -1 : 1);
  ctx.fillStyle = f.color ?? theme.furnitureFill;
  ctx.strokeStyle = theme.furnitureStroke;
  ctx.lineWidth = 1.1 * px;
  ctx.lineJoin = 'round';
  if (item) {
    item.draw(ctx, f.width, f.depth);
  } else {
    ctx.beginPath();
    ctx.rect(-f.width / 2, -f.depth / 2, f.width, f.depth);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draw every symbol too small to detail.
 *
 * These use `fillRect` on the axis-aligned footprint rather than building
 * paths: at this size the rotation is sub-pixel, and `fillRect` skips both path
 * construction and the per-item transform save/restore that dominate the frame
 * when thousands of symbols are on screen at once. Collecting them into one
 * giant path is *slower*, not faster — a single fill with thousands of
 * subpaths forces the rasteriser to sort every edge against every scanline.
 */
function drawFurnitureBatch(
  ctx: CanvasRenderingContext2D,
  items: Furniture[],
  theme: RenderTheme,
) {
  ctx.save();
  const defaultFill = theme.furnitureFill;
  let current = defaultFill;
  ctx.fillStyle = current;
  for (const f of items) {
    const color = f.color ?? defaultFill;
    if (color !== current) {
      current = color;
      ctx.fillStyle = color;
    }
    const c = furnitureCorners(f);
    let minX = c[0].x;
    let minY = c[0].y;
    let maxX = c[0].x;
    let maxY = c[0].y;
    for (let i = 1; i < 4; i++) {
      if (c[i].x < minX) minX = c[i].x;
      else if (c[i].x > maxX) maxX = c[i].x;
      if (c[i].y < minY) minY = c[i].y;
      else if (c[i].y > maxY) maxY = c[i].y;
    }
    ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
  }
  ctx.restore();
}

/* ------------------------------------------------------------- dimensions */

function drawDimension(
  ctx: CanvasRenderingContext2D,
  dim: Dimension,
  project: Project,
  theme: RenderTheme,
  px: number,
  alpha: number,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = theme.dimension;
  ctx.fillStyle = theme.dimension;
  ctx.lineWidth = 1.1 * px;
  const textSize = Math.min(Math.max(11 * px, 130), 320);
  ctx.font = `600 ${textSize}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (dim.kind === 'angular' && dim.points.length >= 3) {
    const [vtx, p1, p2] = dim.points;
    const r = Math.min(dist(vtx, p1), dist(vtx, p2)) * 0.6;
    const a1 = angleOf(sub(p1, vtx));
    const a2 = angleOf(sub(p2, vtx));
    ctx.beginPath();
    ctx.moveTo(vtx.x, vtx.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.moveTo(vtx.x, vtx.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(vtx.x, vtx.y, r, a1, a2);
    ctx.stroke();
    let deg = ((a2 - a1) * 180) / Math.PI;
    deg = ((deg % 360) + 360) % 360;
    const midate = (a1 + a2) / 2;
    const lp = add(vtx, { x: Math.cos(midate) * r * 1.25, y: Math.sin(midate) * r * 1.25 });
    label(ctx, `${deg.toFixed(1)}°`, lp, theme, px, textSize);
    ctx.restore();
    return;
  }

  if (dim.kind === 'radial' && dim.points.length >= 2) {
    const [c, edge] = dim.points;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(edge.x, edge.y);
    ctx.stroke();
    arrow(ctx, edge, normalize(sub(edge, c)), px);
    label(ctx, `R ${formatLength(dist(c, edge), project.unit)}`, mid(c, edge), theme, px, textSize);
    ctx.restore();
    return;
  }

  // Linear family — chain and baseline are runs of linear segments.
  const pts = dim.points;
  if (pts.length < 2) {
    ctx.restore();
    return;
  }

  const pairs: Array<[Vec2, Vec2]> = [];
  if (dim.kind === 'baseline') {
    for (let i = 1; i < pts.length; i++) pairs.push([pts[0], pts[i]]);
  } else {
    for (let i = 0; i + 1 < pts.length; i++) pairs.push([pts[i], pts[i + 1]]);
  }

  pairs.forEach(([rawA, rawB], idx) => {
    let a = rawA;
    let b = rawB;
    if (dim.kind === 'horizontal') b = { x: b.x, y: a.y };
    if (dim.kind === 'vertical') b = { x: a.x, y: b.y };

    const d = normalize(sub(b, a));
    if (d.x === 0 && d.y === 0) return;
    const n = { x: d.y, y: -d.x };
    // Baseline dimensions stack outward so they never overlap.
    const off = dim.offset * (dim.kind === 'baseline' ? idx + 1 : 1);
    const oa = add(a, mul(n, off));
    const ob = add(b, mul(n, off));

    // Extension lines.
    ctx.save();
    ctx.setLineDash([4 * px, 4 * px]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(add(oa, mul(n, 6 * px)).x, add(oa, mul(n, 6 * px)).y);
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(add(ob, mul(n, 6 * px)).x, add(ob, mul(n, 6 * px)).y);
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(oa.x, oa.y);
    ctx.lineTo(ob.x, ob.y);
    ctx.stroke();
    arrow(ctx, oa, mul(d, -1), px);
    arrow(ctx, ob, d, px);

    const text = dim.label ?? formatLength(dist(a, b), project.unit);
    label(ctx, text, mid(oa, ob), theme, px, textSize, angleOf(d));
  });

  ctx.restore();
}

function arrow(ctx: CanvasRenderingContext2D, at: Vec2, dir: Vec2, px: number) {
  const size = 7 * px;
  const n = { x: dir.y, y: -dir.x };
  ctx.beginPath();
  ctx.moveTo(at.x, at.y);
  ctx.lineTo(at.x - dir.x * size + n.x * size * 0.35, at.y - dir.y * size + n.y * size * 0.35);
  ctx.lineTo(at.x - dir.x * size - n.x * size * 0.35, at.y - dir.y * size - n.y * size * 0.35);
  ctx.closePath();
  ctx.fill();
}

function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  at: Vec2,
  theme: RenderTheme,
  px: number,
  size: number,
  angle = 0,
) {
  ctx.save();
  ctx.translate(at.x, at.y);
  // Keep text upright regardless of dimension direction.
  let a = angle;
  if (a > Math.PI / 2 || a < -Math.PI / 2) a += Math.PI;
  ctx.rotate(a);
  const w = ctx.measureText(text).width;
  ctx.fillStyle = theme.background;
  ctx.globalAlpha = ctx.globalAlpha * 0.85;
  ctx.fillRect(-w / 2 - 3 * px, -size * 0.62, w + 6 * px, size * 1.24);
  ctx.globalAlpha = 1;
  ctx.fillStyle = theme.dimension;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/**
 * Walls whose length is already reported by a room's width/height caption.
 *
 * Every room prints its own dimensions, so labelling the walls that form its
 * boundary as well would stack two numbers for the same edge — which is what
 * made the drawing unreadable. Computed per project revision, not per frame.
 */
const roomEdgeWallCache = new WeakMap<Project, Set<ID>>();

function wallsCoveredByRooms(project: Project): Set<ID> {
  const cached = roomEdgeWallCache.get(project);
  if (cached) return cached;

  const covered = new Set<ID>();
  const roomEdges: Array<{ horizontal: boolean; at: number; from: number; to: number }> = [];

  for (const id of project.order) {
    const e = project.entities[id];
    if (!e || e.type !== 'room') continue;
    // Walls a room box owns are covered by definition.
    for (const w of e.wallIds ?? []) covered.add(w);
    const b = rectFromPoints(e.polygon);
    roomEdges.push(
      { horizontal: true, at: b.y, from: b.x, to: b.x + b.w },
      { horizontal: true, at: b.y + b.h, from: b.x, to: b.x + b.w },
      { horizontal: false, at: b.x, from: b.y, to: b.y + b.h },
      { horizontal: false, at: b.x + b.w, from: b.y, to: b.y + b.h },
    );
  }

  for (const id of project.order) {
    const e = project.entities[id];
    if (!e || e.type !== 'wall' || covered.has(id)) continue;
    if (Math.abs(e.bulge) > 1e-4) continue;
    const horizontal = Math.abs(e.a.y - e.b.y) < 1;
    const vertical = Math.abs(e.a.x - e.b.x) < 1;
    if (!horizontal && !vertical) continue;

    // A wall lies "on" a room edge when its centreline is within half its own
    // thickness of that edge and spans essentially the same run.
    const tol = e.thickness / 2 + 2;
    const at = horizontal ? e.a.y : e.a.x;
    const lo = Math.min(horizontal ? e.a.x : e.a.y, horizontal ? e.b.x : e.b.y);
    const hi = Math.max(horizontal ? e.a.x : e.a.y, horizontal ? e.b.x : e.b.y);

    for (const edge of roomEdges) {
      if (edge.horizontal !== horizontal) continue;
      if (Math.abs(edge.at - at) > tol) continue;
      if (lo <= edge.from + tol && hi >= edge.to - tol) {
        covered.add(id);
        break;
      }
    }
  }

  roomEdgeWallCache.set(project, covered);
  return covered;
}

/** Length tags on walls that no room already dimensions. */
function drawWallLengths(
  ctx: CanvasRenderingContext2D,
  project: Project,
  order: ID[],
  view: Rect,
  theme: RenderTheme,
  px: number,
  vp: Viewport,
) {
  const covered = wallsCoveredByRooms(project);
  const size = Math.min(Math.max(10 * px, 110), 260);
  ctx.save();
  ctx.font = `500 ${size}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const id of order) {
    const e = project.entities[id];
    if (!e || e.type !== 'wall' || !isEntityVisible(project, e)) continue;
    if (covered.has(id)) continue;
    if (!intersects(entityBounds(e, project), view)) continue;
    const L = wallLength(e);
    // Skip tags that would be wider than the wall they annotate.
    if (L * vp.scale < 46) continue;
    const line = wallCenterline(e);
    const c = mid(line[0], line[line.length - 1]);
    const d = normalize(sub(e.b, e.a));
    const n = { x: d.y, y: -d.x };
    const at = add(c, mul(n, e.thickness / 2 + 14 * px));
    label(ctx, formatLength(L, project.unit, { compact: true }), at, theme, px, size, angleOf(d));
  }
  ctx.restore();
}

/* ------------------------------------------------------------------- text */

function drawText(ctx: CanvasRenderingContext2D, t: TextNote, theme: RenderTheme, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(t.position.x, t.position.y);
  ctx.rotate(t.rotation);
  ctx.fillStyle = theme.text;
  ctx.font = `500 ${t.size}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  for (const [i, ln] of t.text.split('\n').entries()) ctx.fillText(ln, 0, i * t.size * 1.3);
  ctx.restore();
}

/* ---------------------------------------------------------------- overlay */

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  input: RenderInput,
  theme: RenderTheme,
  px: number,
) {
  const { overlay, project, viewport } = input;

  // Host-wall highlight for door/window placement.
  if (overlay.hostWallId) {
    const wall = project.entities[overlay.hostWallId];
    if (wall && wall.type === 'wall') {
      const outline = wallOutline(wall);
      ctx.save();
      ctx.strokeStyle = theme.selection;
      ctx.lineWidth = 2 * px;
      ctx.beginPath();
      ctx.moveTo(outline[0].x, outline[0].y);
      for (let i = 1; i < outline.length; i++) ctx.lineTo(outline[i].x, outline[i].y);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
  }

  // Alignment / snap guides.
  const guides = [...(overlay.guides ?? []), ...(overlay.snap?.guides ?? [])];
  if (guides.length > 0) {
    ctx.save();
    ctx.strokeStyle = theme.guide;
    ctx.lineWidth = px;
    ctx.setLineDash([6 * px, 5 * px]);
    ctx.beginPath();
    for (const g of guides) {
      ctx.moveTo(g.a.x, g.a.y);
      ctx.lineTo(g.b.x, g.b.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  if (overlay.draft) drawDraft(ctx, overlay.draft, project, theme, px);

  // Marquee.
  if (overlay.marquee) {
    const r = rectFromCorners(overlay.marquee.a, overlay.marquee.b);
    ctx.save();
    ctx.fillStyle = theme.selectionFill;
    ctx.strokeStyle = theme.selection;
    ctx.lineWidth = px;
    ctx.setLineDash([4 * px, 3 * px]);
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.restore();
  }

  // Snap marker.
  if (overlay.snap && overlay.snap.kinds.length > 0) {
    const p = overlay.snap.point;
    const s = 5 * px;
    ctx.save();
    ctx.strokeStyle = theme.snapMarker;
    ctx.lineWidth = 1.6 * px;
    ctx.beginPath();
    ctx.rect(p.x - s, p.y - s, s * 2, s * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Callouts — screen-space so they stay legible at any zoom.
  if (overlay.callouts && overlay.callouts.length > 0) {
    ctx.save();
    ctx.setTransform(input.dpr, 0, 0, input.dpr, 0, 0);
    ctx.font = '600 12px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    for (const c of overlay.callouts) {
      const s = worldToScreen(c.at, viewport);
      const w = ctx.measureText(c.text).width + 14;
      ctx.fillStyle = theme.measureBg;
      ctx.beginPath();
      ctx.roundRect(s.x + 14, s.y - 26, w, 22, 6);
      ctx.fill();
      ctx.fillStyle = theme.measureText;
      ctx.fillText(c.text, s.x + 21, s.y - 15);
    }
    ctx.restore();
  }
}

function drawDraft(
  ctx: CanvasRenderingContext2D,
  draft: DraftPreview,
  project: Project,
  theme: RenderTheme,
  px: number,
) {
  ctx.save();
  ctx.globalAlpha = 0.85;
  const ok = draft.valid !== false;
  ctx.strokeStyle = ok ? theme.selection : '#ef4444';
  ctx.fillStyle = ok ? theme.selectionFill : 'rgba(239,68,68,0.15)';
  ctx.lineWidth = 1.5 * px;

  if (draft.kind === 'wall' && draft.points.length >= 2) {
    const thickness = draft.thickness ?? project.wallDefaults.interiorThickness;
    const preview: Wall = {
      id: 'draft',
      type: 'wall',
      layerId: '',
      a: draft.points[0],
      b: draft.points[1],
      bulge: draft.bulge ?? 0,
      thickness,
      height: 0,
      material: 'drywall',
      exterior: false,
      locked: false,
      hidden: false,
    };
    const outline = wallOutline(preview);
    ctx.beginPath();
    ctx.moveTo(outline[0].x, outline[0].y);
    for (let i = 1; i < outline.length; i++) ctx.lineTo(outline[i].x, outline[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if ((draft.kind === 'room' || draft.kind === 'dimension' || draft.kind === 'measure') && draft.points.length >= 2) {
    ctx.beginPath();
    ctx.moveTo(draft.points[0].x, draft.points[0].y);
    for (let i = 1; i < draft.points.length; i++) ctx.lineTo(draft.points[i].x, draft.points[i].y);
    if (draft.kind === 'room') {
      ctx.closePath();
      ctx.fill();
    }
    ctx.stroke();
    for (const p of draft.points) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3 * px, 0, Math.PI * 2);
      ctx.fillStyle = theme.selection;
      ctx.fill();
    }
  } else if (draft.kind === 'furniture' && draft.catalogId && draft.points.length >= 1) {
    const item = CATALOG_BY_ID.get(draft.catalogId);
    if (item) {
      ctx.save();
      ctx.translate(draft.points[0].x, draft.points[0].y);
      ctx.rotate(draft.rotation ?? 0);
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = theme.furnitureFill;
      ctx.strokeStyle = theme.selection;
      item.draw(ctx, item.width, item.depth);
      ctx.restore();
    }
  }
  ctx.restore();
}

/* -------------------------------------------------------------- selection */

function drawSelection(
  ctx: CanvasRenderingContext2D,
  project: Project,
  ui: UIState,
  theme: RenderTheme,
  px: number,
) {
  // Hover outline.
  if (ui.hoverId && !ui.selection.includes(ui.hoverId)) {
    const e = project.entities[ui.hoverId];
    if (e) outlineEntity(ctx, e, project, theme.hover, 1.5 * px, px);
  }

  for (const id of ui.selection) {
    const e = project.entities[id];
    if (e) outlineEntity(ctx, e, project, theme.selection, 2 * px, px);
  }

  if (ui.selection.length === 0) return;
  const b = selectionBounds(project, ui.selection);
  if (!b) return;

  const anyLocked = ui.selection.some((id) => project.entities[id]?.locked);

  ctx.save();
  ctx.strokeStyle = anyLocked ? '#94a3b8' : theme.selection;
  ctx.lineWidth = px;
  ctx.setLineDash([5 * px, 4 * px]);
  ctx.strokeRect(b.x, b.y, b.w, b.h);
  ctx.setLineDash([]);

  if (!anyLocked) {
    // Resize handles.
    const hs = (HANDLE_PX * px) / 2;
    const corners: Vec2[] = [
      { x: b.x, y: b.y },
      { x: b.x + b.w / 2, y: b.y },
      { x: b.x + b.w, y: b.y },
      { x: b.x + b.w, y: b.y + b.h / 2 },
      { x: b.x + b.w, y: b.y + b.h },
      { x: b.x + b.w / 2, y: b.y + b.h },
      { x: b.x, y: b.y + b.h },
      { x: b.x, y: b.y + b.h / 2 },
    ];
    ctx.fillStyle = theme.background;
    ctx.strokeStyle = theme.selection;
    ctx.lineWidth = 1.5 * px;
    for (const c of corners) {
      ctx.beginPath();
      ctx.rect(c.x - hs, c.y - hs, hs * 2, hs * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Rotation handle above the top edge.
    const rot = { x: b.x + b.w / 2, y: b.y - ROTATE_HANDLE_OFFSET_PX * px };
    ctx.beginPath();
    ctx.moveTo(b.x + b.w / 2, b.y);
    ctx.lineTo(rot.x, rot.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(rot.x, rot.y, hs * 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  // Wall endpoint handles when a single wall is selected.
  if (ui.selection.length === 1) {
    const e = project.entities[ui.selection[0]];
    if (e && e.type === 'wall' && !e.locked) {
      ctx.save();
      ctx.fillStyle = theme.background;
      ctx.strokeStyle = theme.selection;
      ctx.lineWidth = 1.8 * px;
      for (const p of [e.a, e.b]) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, (HANDLE_PX * px) / 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}

function outlineEntity(
  ctx: CanvasRenderingContext2D,
  e: Entity,
  project: Project,
  color: string,
  width: number,
  px: number,
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  switch (e.type) {
    case 'wall': {
      const o = wallOutline(e);
      ctx.moveTo(o[0].x, o[0].y);
      for (let i = 1; i < o.length; i++) ctx.lineTo(o[i].x, o[i].y);
      ctx.closePath();
      break;
    }
    case 'room': {
      ctx.moveTo(e.polygon[0].x, e.polygon[0].y);
      for (let i = 1; i < e.polygon.length; i++) ctx.lineTo(e.polygon[i].x, e.polygon[i].y);
      ctx.closePath();
      break;
    }
    case 'furniture': {
      const c = furnitureCorners(e);
      ctx.moveTo(c[0].x, c[0].y);
      for (let i = 1; i < c.length; i++) ctx.lineTo(c[i].x, c[i].y);
      ctx.closePath();
      break;
    }
    case 'door':
    case 'window': {
      const wall = project.entities[e.wallId];
      if (wall && wall.type === 'wall') {
        const pl = openingPlacement(e, wall);
        const h = mul(pl.across, wall.thickness / 2 + 2 * px);
        ctx.moveTo(pl.start.x + h.x, pl.start.y + h.y);
        ctx.lineTo(pl.end.x + h.x, pl.end.y + h.y);
        ctx.lineTo(pl.end.x - h.x, pl.end.y - h.y);
        ctx.lineTo(pl.start.x - h.x, pl.start.y - h.y);
        ctx.closePath();
      }
      break;
    }
    default: {
      const b = entityBounds(e, project);
      ctx.rect(b.x - 2 * px, b.y - 2 * px, b.w + 4 * px, b.h + 4 * px);
    }
  }
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------- handle hit */

export type HandleId =
  | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
  | 'rotate'
  | 'wall-a'
  | 'wall-b';

/** Which selection handle (if any) is under the screen-space point. */
export function hitHandle(
  project: Project,
  selection: ID[],
  screenPoint: Vec2,
  vp: Viewport,
): HandleId | null {
  if (selection.length === 0) return null;
  if (selection.some((id) => project.entities[id]?.locked)) return null;
  const b = selectionBounds(project, selection);
  if (!b) return null;
  const tol = HANDLE_PX;

  if (selection.length === 1) {
    const e = project.entities[selection[0]];
    if (e && e.type === 'wall') {
      const sa = worldToScreen(e.a, vp);
      const sb = worldToScreen(e.b, vp);
      if (dist(screenPoint, sa) <= tol) return 'wall-a';
      if (dist(screenPoint, sb) <= tol) return 'wall-b';
    }
  }

  const tl = worldToScreen({ x: b.x, y: b.y }, vp);
  const br = worldToScreen({ x: b.x + b.w, y: b.y + b.h }, vp);
  const cx = (tl.x + br.x) / 2;
  const cy = (tl.y + br.y) / 2;

  const handles: Array<[HandleId, Vec2]> = [
    ['nw', { x: tl.x, y: tl.y }],
    ['n', { x: cx, y: tl.y }],
    ['ne', { x: br.x, y: tl.y }],
    ['e', { x: br.x, y: cy }],
    ['se', { x: br.x, y: br.y }],
    ['s', { x: cx, y: br.y }],
    ['sw', { x: tl.x, y: br.y }],
    ['w', { x: tl.x, y: cy }],
    ['rotate', { x: cx, y: tl.y - ROTATE_HANDLE_OFFSET_PX }],
  ];
  for (const [id, p] of handles) if (dist(screenPoint, p) <= tol) return id;
  return null;
}

export const HANDLE_CURSOR: Record<HandleId, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
  rotate: 'grab',
  'wall-a': 'move',
  'wall-b': 'move',
};

export { rotate as rotatePoint };
