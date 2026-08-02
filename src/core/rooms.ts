import type { Project, Room, RoomType, Vec2, Wall } from '@/types';
import { uid } from './id';
import {
  EPS,
  angleOf,
  dist,
  normalizeAngle,
  pointInPolygon,
  polygonArea,
  segmentIntersection,
  signedArea,
  sub,
} from './geometry';
import { wallCenterline, wallsOf } from './entities';

/** Points closer than this collapse to the same graph node (mm). */
const WELD_TOL = 12;

interface Node {
  id: number;
  p: Vec2;
  /** Neighbour node ids. */
  edges: number[];
}

/**
 * Build a planar graph from wall centrelines: sample every wall into segments,
 * split them at mutual intersections, and weld near-coincident endpoints so
 * hand-drawn corners still close.
 */
function buildGraph(walls: Wall[]): { nodes: Node[]; edges: Array<[number, number]> } {
  // 1. Flatten walls to segments (curved walls contribute their sampled chords).
  let segments: Array<[Vec2, Vec2]> = [];
  for (const w of walls) {
    const line = wallCenterline(w);
    for (let i = 0; i + 1 < line.length; i++) segments.push([line[i], line[i + 1]]);
  }

  // 2. Split every segment at intersections with every other segment. O(n²) is
  //    fine here: this runs on wall count, not object count, and is debounced.
  const split: Array<[Vec2, Vec2]> = [];
  for (let i = 0; i < segments.length; i++) {
    const [a, b] = segments[i];
    const cuts: Array<{ t: number; p: Vec2 }> = [];
    for (let j = 0; j < segments.length; j++) {
      if (i === j) continue;
      const hit = segmentIntersection(a, b, segments[j][0], segments[j][1]);
      if (!hit) continue;
      const t = dist(a, hit) / Math.max(EPS, dist(a, b));
      if (t > 1e-4 && t < 1 - 1e-4) cuts.push({ t, p: hit });
    }
    cuts.sort((m, n) => m.t - n.t);
    let prev = a;
    for (const c of cuts) {
      if (dist(prev, c.p) > WELD_TOL) split.push([prev, c.p]);
      prev = c.p;
    }
    if (dist(prev, b) > WELD_TOL) split.push([prev, b]);
  }
  segments = split;

  // 3. Weld endpoints into shared nodes.
  const nodes: Node[] = [];
  const nodeAt = (p: Vec2): number => {
    for (const n of nodes) if (dist(n.p, p) <= WELD_TOL) return n.id;
    const n: Node = { id: nodes.length, p, edges: [] };
    nodes.push(n);
    return n.id;
  };

  const edgeSet = new Set<string>();
  const edges: Array<[number, number]> = [];
  for (const [a, b] of segments) {
    const na = nodeAt(a);
    const nb = nodeAt(b);
    if (na === nb) continue;
    const key = na < nb ? `${na}:${nb}` : `${nb}:${na}`;
    if (edgeSet.has(key)) continue;
    edgeSet.add(key);
    edges.push([na, nb]);
    nodes[na].edges.push(nb);
    nodes[nb].edges.push(na);
  }
  return { nodes, edges };
}

/**
 * Find the minimal cycles (faces) of the planar graph by half-edge traversal:
 * from each directed edge u→v, always take the most clockwise turn at v. Every
 * bounded face is traced exactly once; the unbounded outer face is the one with
 * the opposite winding, and is dropped.
 */
export function detectEnclosures(walls: Wall[]): Vec2[][] {
  if (walls.length < 3) return [];
  const { nodes, edges } = buildGraph(walls);
  if (edges.length < 3) return [];

  // Sort each node's neighbours by angle so "next clockwise" is a lookup.
  const sorted = new Map<number, number[]>();
  for (const n of nodes) {
    const list = [...new Set(n.edges)];
    list.sort((a, b) => angleOf(sub(nodes[a].p, n.p)) - angleOf(sub(nodes[b].p, n.p)));
    sorted.set(n.id, list);
  }

  const nextHalfEdge = (from: number, to: number): [number, number] | null => {
    const around = sorted.get(to);
    if (!around || around.length === 0) return null;
    const idx = around.indexOf(from);
    if (idx < 0) return null;
    // Neighbours are sorted by atan2 in a y-down plane, so "next in the list"
    // is the next edge anticlockwise on screen — the tightest left turn, which
    // traces bounded faces and leaves the unbounded one with inverted winding.
    const next = around[(idx + 1) % around.length];
    return [to, next];
  };

  const visited = new Set<string>();
  const faces: Vec2[][] = [];

  const starts: Array<[number, number]> = [];
  for (const [a, b] of edges) {
    starts.push([a, b]);
    starts.push([b, a]);
  }

  for (const start of starts) {
    const key = `${start[0]}>${start[1]}`;
    if (visited.has(key)) continue;

    const cycle: number[] = [];
    let cur: [number, number] | null = start;
    let guard = 0;
    while (cur && guard++ < edges.length * 4) {
      const k = `${cur[0]}>${cur[1]}`;
      if (visited.has(k)) break;
      visited.add(k);
      cycle.push(cur[0]);
      cur = nextHalfEdge(cur[0], cur[1]);
      if (cur && cur[0] === start[0] && cur[1] === start[1]) break;
    }

    if (cycle.length < 3) continue;
    const poly = cycle.map((id) => nodes[id].p);
    // Screen coords have y down, so a bounded face traced by clockwise turns
    // comes out with negative signed area; the outer face comes out positive.
    if (signedArea(poly) >= 0) continue;
    const cleaned = dedupe(poly);
    if (cleaned.length < 3) continue;
    if (polygonArea(cleaned) < 100_000) continue; // < 0.1 m², almost certainly noise
    faces.push(cleaned.reverse()); // store clockwise
  }

  return faces;
}

function dedupe(poly: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of poly) {
    if (out.length === 0 || dist(out[out.length - 1], p) > WELD_TOL) out.push(p);
  }
  while (out.length > 1 && dist(out[0], out[out.length - 1]) <= WELD_TOL) out.pop();
  // Drop collinear vertices so room polygons stay minimal.
  const simplified: Vec2[] = [];
  for (let i = 0; i < out.length; i++) {
    const prev = out[(i - 1 + out.length) % out.length];
    const cur = out[i];
    const next = out[(i + 1) % out.length];
    const a1 = angleOf(sub(cur, prev));
    const a2 = angleOf(sub(next, cur));
    if (Math.abs(normalizeAngle(a2 - a1)) > 0.01) simplified.push(cur);
  }
  return simplified.length >= 3 ? simplified : out;
}

/* --------------------------------------------------- naming & classifying */

const ROOM_COLORS: Record<RoomType, string> = {
  bedroom: '#dbeafe',
  kitchen: '#fef3c7',
  living: '#dcfce7',
  bathroom: '#cffafe',
  dining: '#fae8ff',
  balcony: '#ecfccb',
  utility: '#e2e8f0',
  hallway: '#f1f5f9',
  office: '#ede9fe',
  other: '#f8fafc',
};

export const roomColor = (t: RoomType): string => ROOM_COLORS[t];

/**
 * Guess a room's purpose from its footprint. Heuristics only — the user can
 * always rename, and `renamed` rooms are never re-classified.
 */
export function classifyRoom(polygon: Vec2[]): RoomType {
  const area = polygonArea(polygon) / 1_000_000; // m²
  const bbox = bboxOf(polygon);
  const long = Math.max(bbox.w, bbox.h) / 1000;
  const short = Math.min(bbox.w, bbox.h) / 1000;
  const ratio = short < EPS ? 99 : long / short;

  if (ratio > 3.2 && short < 2.2) return 'hallway';
  if (area < 2.2) return 'utility';
  if (area < 5.5) return 'bathroom';
  if (area < 9 && ratio > 2) return 'balcony';
  if (area < 10) return 'kitchen';
  if (area < 18) return 'bedroom';
  if (area < 26) return 'dining';
  return 'living';
}

function bboxOf(poly: Vec2[]): { w: number; h: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { w: maxX - minX, h: maxY - minY };
}

export function defaultRoomName(type: RoomType, existing: string[]): string {
  const base: Record<RoomType, string> = {
    bedroom: 'Bedroom',
    kitchen: 'Kitchen',
    living: 'Living Room',
    bathroom: 'Bathroom',
    dining: 'Dining',
    balcony: 'Balcony',
    utility: 'Utility',
    hallway: 'Hallway',
    office: 'Office',
    other: 'Room',
  };
  const name = base[type];
  if (!existing.includes(name)) return name;
  let i = 2;
  while (existing.includes(`${name} ${i}`)) i++;
  return `${name} ${i}`;
}

export function makeRoom(polygon: Vec2[], layerId: string, existingNames: string[], auto: boolean): Room {
  const roomType = classifyRoom(polygon);
  return {
    id: uid('room'),
    type: 'room',
    layerId,
    polygon,
    name: defaultRoomName(roomType, existingNames),
    roomType,
    auto,
    renamed: false,
    floorFinish: 'Tile',
    wallFinish: 'Paint',
    ceilingHeight: 2700,
    color: roomColor(roomType),
    locked: false,
    hidden: false,
  };
}

/**
 * Reconcile auto-detected rooms with the project.
 *
 * Existing auto rooms are matched to new enclosures by centroid proximity so
 * that edits to a wall move a room rather than replacing it — which is what
 * preserves user-set names, finishes, and notes across every wall drag.
 */
export function syncAutoRooms(project: Project): Project {
  const layer = project.layers.find((l) => l.kind === 'rooms');
  if (!layer) return project;

  const enclosures = detectEnclosures(wallsOf(project));
  const entities = { ...project.entities };
  const order = [...project.order];

  const existingAuto: Room[] = [];
  for (const id of project.order) {
    const e = entities[id];
    if (e && e.type === 'room' && e.auto) existingAuto.push(e);
  }

  const usedNames = new Set<string>();
  for (const id of project.order) {
    const e = entities[id];
    if (e && e.type === 'room') usedNames.add(e.name);
  }

  const matched = new Set<string>();
  const keep = new Set<string>();

  for (const poly of enclosures) {
    const c = centroid(poly);
    const area = polygonArea(poly);
    // Tolerance scales with room size so dragging a wall still re-matches.
    const tol = Math.sqrt(area) * 0.75 + 500;

    // Prefer a prior room whose centre still falls inside this enclosure —
    // that survives wall drags. When several do (rooms merged because a
    // partition was deleted), the largest contributor wins, so the merged room
    // keeps the name of the space it mostly is.
    let best: Room | null = null;
    let bestD = Infinity;
    let bestArea = -1;
    for (const room of existingAuto) {
      if (matched.has(room.id)) continue;
      const rc = centroid(room.polygon);
      const d = dist(c, rc);
      if (pointInPolygon(rc, poly)) {
        const a = polygonArea(room.polygon);
        if (a > bestArea) {
          bestArea = a;
          best = room;
          bestD = 0;
        }
      } else if (bestArea < 0 && d < bestD) {
        bestD = d;
        best = room;
      }
    }

    if (best && bestD <= tol) {
      matched.add(best.id);
      keep.add(best.id);
      const roomType = best.renamed ? best.roomType : classifyRoom(poly);
      entities[best.id] = {
        ...best,
        polygon: poly,
        roomType,
        color: best.renamed ? best.color : roomColor(roomType),
      };
    } else {
      const room = makeRoom(poly, layer.id, [...usedNames], true);
      usedNames.add(room.name);
      entities[room.id] = room;
      order.push(room.id);
      keep.add(room.id);
    }
  }

  // Drop auto rooms whose enclosure no longer exists.
  for (const room of existingAuto) {
    if (keep.has(room.id)) continue;
    delete entities[room.id];
    const idx = order.indexOf(room.id);
    if (idx >= 0) order.splice(idx, 1);
  }

  return { ...project, entities, order };
}

function centroid(poly: Vec2[]): Vec2 {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p.x;
    y += p.y;
  }
  return { x: x / poly.length, y: y / poly.length };
}

export const _internal = { buildGraph, dedupe, uid };
