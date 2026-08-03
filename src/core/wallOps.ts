import type { ID, Project, Vec2, Wall } from '@/types';
import { uid } from './id';
import {
  add,
  dist,
  equalish,
  lineIntersection,
  mul,
  normal,
  normalizeAngle,
  angleOf,
  sub,
} from './geometry';
import { openingsOnWall, wallLength, wallParamAt, wallPointAt, wallsOf } from './entities';

/** Endpoints within this distance are treated as the same joint (mm). */
export const JOINT_TOL = 20;

/**
 * Weld wall endpoints that are nearly coincident onto a single point.
 *
 * Run after any wall edit. This is what guarantees "walls automatically connect,
 * no gaps": rather than tracking joint objects, we snap the geometry itself so
 * every downstream consumer (rendering, room detection, export) sees closed
 * corners without special cases.
 */
export function weldWallJoints(project: Project, movedIds?: ID[]): Project {
  const walls = wallsOf(project);
  if (walls.length < 2) return project;

  const entities = { ...project.entities };
  const focus = movedIds ? new Set(movedIds) : null;
  let changed = false;

  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const w1 = entities[walls[i].id] as Wall;
      const w2 = entities[walls[j].id] as Wall;
      if (!w1 || !w2) continue;
      // Only weld when at least one side just moved, so untouched geometry
      // never drifts on unrelated edits.
      if (focus && !focus.has(w1.id) && !focus.has(w2.id)) continue;

      for (const e1 of ['a', 'b'] as const) {
        for (const e2 of ['a', 'b'] as const) {
          const p1 = (entities[w1.id] as Wall)[e1];
          const p2 = (entities[w2.id] as Wall)[e2];
          if (equalish(p1, p2, 0.01)) continue;
          if (dist(p1, p2) > JOINT_TOL) continue;
          // The wall that moved yields to the one that did not.
          const target = focus && focus.has(w1.id) && !focus.has(w2.id) ? p2 : p1;
          entities[w1.id] = { ...(entities[w1.id] as Wall), [e1]: { ...target } };
          entities[w2.id] = { ...(entities[w2.id] as Wall), [e2]: { ...target } };
          changed = true;
        }
      }
    }
  }

  return changed ? { ...project, entities } : project;
}

/** Split a wall at a world point, preserving openings on the correct side. */
export function splitWall(project: Project, wallId: ID, at: Vec2): Project {
  const wall = project.entities[wallId];
  if (!wall || wall.type !== 'wall') return project;

  const { t } = wallParamAt(wall, at);
  if (t <= 0.02 || t >= 0.98) return project;
  const point = wallPointAt(wall, t);

  const first: Wall = { ...wall, b: point, bulge: wall.bulge * t };
  const second: Wall = { ...wall, id: uid('wall'), a: point, bulge: wall.bulge * (1 - t) };

  const entities = { ...project.entities, [first.id]: first, [second.id]: second };
  const order = [...project.order];
  order.splice(order.indexOf(wallId) + 1, 0, second.id);

  // Re-home openings: those past the split belong to the second wall, and their
  // parameter must be re-normalised against the shorter host.
  for (const op of openingsOnWall(project, wallId)) {
    if (op.t <= t) {
      entities[op.id] = { ...op, t: op.t / t };
    } else {
      entities[op.id] = { ...op, wallId: second.id, t: (op.t - t) / (1 - t) };
    }
  }

  return { ...project, entities, order };
}

/**
 * Merge two walls that share an endpoint and run in (nearly) the same direction.
 * Returns the project unchanged when they cannot be merged cleanly.
 */
export function mergeWalls(project: Project, idA: ID, idB: ID): Project {
  const a = project.entities[idA];
  const b = project.entities[idB];
  if (!a || a.type !== 'wall' || !b || b.type !== 'wall') return project;
  if (Math.abs(a.bulge) > 1e-4 || Math.abs(b.bulge) > 1e-4) return project;

  // Find the shared joint and the two free ends.
  let start: Vec2 | null = null;
  let end: Vec2 | null = null;
  const pairs: Array<[Vec2, Vec2, Vec2, Vec2]> = [
    [a.a, a.b, b.a, b.b],
    [a.a, a.b, b.b, b.a],
    [a.b, a.a, b.a, b.b],
    [a.b, a.a, b.b, b.a],
  ];
  for (const [freeA, jointA, jointB, freeB] of pairs) {
    if (dist(jointA, jointB) <= JOINT_TOL) {
      start = freeA;
      end = freeB;
      break;
    }
  }
  if (!start || !end) return project;

  const angA = angleOf(sub(a.b, a.a));
  const angB = angleOf(sub(b.b, b.a));
  const diff = Math.abs(normalizeAngle(angA - angB));
  if (diff > 0.05 && Math.abs(diff - Math.PI) > 0.05) return project;

  const mergedLength = dist(start, end);
  const lenA = wallLength(a);

  const merged: Wall = { ...a, a: start, b: end };
  const entities = { ...project.entities, [merged.id]: merged };

  // Rebase openings from both walls onto the merged centreline by arc length.
  const aStartsAtMerged = dist(start, a.a) < dist(start, a.b);
  for (const op of openingsOnWall(project, idA)) {
    const along = (aStartsAtMerged ? op.t : 1 - op.t) * lenA;
    entities[op.id] = { ...op, wallId: merged.id, t: along / mergedLength };
  }
  const bFirst = dist(start, b.a) < dist(start, b.b);
  const offsetB = mergedLength - wallLength(b);
  for (const op of openingsOnWall(project, idB)) {
    const along = offsetB + (bFirst ? op.t : 1 - op.t) * wallLength(b);
    entities[op.id] = { ...op, wallId: merged.id, t: along / mergedLength };
  }

  delete entities[idB];
  const order = project.order.filter((id) => id !== idB);
  return { ...project, entities, order };
}

/** Move a wall's nearest endpoint so the wall reaches `to`. */
export function extendWall(project: Project, wallId: ID, to: Vec2): Project {
  const wall = project.entities[wallId];
  if (!wall || wall.type !== 'wall') return project;
  const key = dist(to, wall.a) < dist(to, wall.b) ? 'a' : 'b';
  const entities = { ...project.entities, [wallId]: { ...wall, [key]: to } };
  return weldWallJoints({ ...project, entities }, [wallId]);
}

/**
 * Trim a wall back to its intersection with another wall, keeping the side the
 * user clicked. Straight walls only — trimming arcs needs a different solver.
 */
export function trimWall(project: Project, wallId: ID, cutterId: ID, keepNear: Vec2): Project {
  const wall = project.entities[wallId];
  const cutter = project.entities[cutterId];
  if (!wall || wall.type !== 'wall' || !cutter || cutter.type !== 'wall') return project;
  if (Math.abs(wall.bulge) > 1e-4) return project;

  const hit = lineIntersection(wall.a, wall.b, cutter.a, cutter.b);
  if (!hit) return project;

  const keepA = dist(keepNear, wall.a) < dist(keepNear, wall.b);
  const next: Wall = keepA ? { ...wall, b: hit } : { ...wall, a: hit };
  if (dist(next.a, next.b) < JOINT_TOL) return project;
  return { ...project, entities: { ...project.entities, [wallId]: next } };
}

/** Duplicate a wall offset perpendicular by `distance` mm (sign picks the side). */
export function offsetWall(project: Project, wallId: ID, distance: number): Project {
  const wall = project.entities[wallId];
  if (!wall || wall.type !== 'wall') return project;
  const n = normal(wall.a, wall.b);
  const d = mul(n, distance);
  const copy: Wall = {
    ...wall,
    id: uid('wall'),
    a: add(wall.a, d),
    b: add(wall.b, d),
  };
  return {
    ...project,
    entities: { ...project.entities, [copy.id]: copy },
    order: [...project.order, copy.id],
  };
}

/** Walls whose endpoints coincide with either end of `wallId`. */
export function connectedWalls(project: Project, wallId: ID): Wall[] {
  const wall = project.entities[wallId];
  if (!wall || wall.type !== 'wall') return [];
  return wallsOf(project).filter(
    (w) =>
      w.id !== wallId &&
      (dist(w.a, wall.a) <= JOINT_TOL ||
        dist(w.a, wall.b) <= JOINT_TOL ||
        dist(w.b, wall.a) <= JOINT_TOL ||
        dist(w.b, wall.b) <= JOINT_TOL),
  );
}

/**
 * Move a wall endpoint and drag every wall sharing that joint with it, so
 * corners stay closed while the user edits.
 */
export function moveWallEndpoint(
  project: Project,
  wallId: ID,
  which: 'a' | 'b',
  to: Vec2,
): Project {
  const wall = project.entities[wallId];
  if (!wall || wall.type !== 'wall') return project;
  const from = wall[which];
  const entities = { ...project.entities };
  const touched: ID[] = [wallId];

  entities[wallId] = { ...wall, [which]: to };
  for (const w of wallsOf(project)) {
    if (w.id === wallId) continue;
    let next = entities[w.id] as Wall;
    if (dist(w.a, from) <= JOINT_TOL) next = { ...next, a: to };
    if (dist(w.b, from) <= JOINT_TOL) next = { ...next, b: to };
    if (next !== entities[w.id]) {
      entities[w.id] = next;
      touched.push(w.id);
    }
  }
  return weldWallJoints({ ...project, entities }, touched);
}

/* -------------------------------------------------- fusing shared walls */

/** Centrelines closer than this are the same line (mm). */
const COLLINEAR_TOL = 12;

interface WallLine {
  /** Unit direction, normalised so opposite-facing walls group together. */
  dx: number;
  dy: number;
  /** Signed perpendicular offset of the line from the origin. */
  offset: number;
}

function lineOf(w: Wall): WallLine | null {
  if (Math.abs(w.bulge) > 1e-4) return null;
  let dx = w.b.x - w.a.x;
  let dy = w.b.y - w.a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;
  dx /= len;
  dy /= len;
  // Canonical direction so a wall and its reverse land in the same group.
  if (dx < -1e-9 || (Math.abs(dx) < 1e-9 && dy < 0)) {
    dx = -dx;
    dy = -dy;
  }
  // Perpendicular offset: the component of `a` across the line.
  const offset = -dy * w.a.x + dx * w.a.y;
  return { dx, dy, offset };
}

/** Position along the line's direction. */
const along = (line: WallLine, p: Vec2): number => line.dx * p.x + line.dy * p.y;

/**
 * Fuse walls that lie on the same line and touch or overlap into single walls.
 *
 * Two rooms placed side by side each build their own four walls, which leaves
 * two coincident walls on the shared edge. Left alone they read as a double
 * wall and behave as two objects. This merges them into one: the survivor spans
 * the union of both runs, every room that referenced either wall is repointed
 * at it, and doors and windows are re-parameterised onto the longer host so
 * they stay exactly where they were drawn.
 *
 * Only walls of equal thickness are fused — a thin partition meeting a thick
 * exterior wall is genuinely two different walls.
 */
export function fuseCollinearWalls(project: Project): Project {
  const walls = wallsOf(project);
  if (walls.length < 2) return project;

  // Bucket by line and thickness. Rounding the key makes near-coincident
  // centrelines land together; exact comparison happens inside the group.
  const groups = new Map<string, Wall[]>();
  for (const w of walls) {
    const line = lineOf(w);
    if (!line) continue;
    const key = [
      Math.round(line.dx * 1000),
      Math.round(line.dy * 1000),
      Math.round(line.offset / COLLINEAR_TOL),
      Math.round(w.thickness),
    ].join(':');
    const list = groups.get(key);
    if (list) list.push(w);
    else groups.set(key, [w]);
  }

  const merges: Array<{ keep: Wall; absorb: Wall[]; a: Vec2; b: Vec2 }> = [];

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const line = lineOf(group[0])!;

    // Sort by start position and sweep, accumulating runs that touch.
    const spans = group
      .map((w) => {
        const s = along(line, w.a);
        const e = along(line, w.b);
        return { w, lo: Math.min(s, e), hi: Math.max(s, e) };
      })
      .sort((m, n) => m.lo - n.lo);

    let run = [spans[0]];
    let hi = spans[0].hi;

    const flush = () => {
      if (run.length < 2) return;
      const lo = run[0].lo;
      // Longest member survives, so its id (and any openings on it) is kept.
      const keep = run.reduce((best, s) => (s.hi - s.lo > best.hi - best.lo ? s : best), run[0]).w;
      const pa = { x: line.dx * lo - line.dy * line.offset, y: line.dy * lo + line.dx * line.offset };
      const pb = { x: line.dx * hi - line.dy * line.offset, y: line.dy * hi + line.dx * line.offset };
      merges.push({ keep, absorb: run.map((s) => s.w).filter((w) => w.id !== keep.id), a: pa, b: pb });
    };

    for (let i = 1; i < spans.length; i++) {
      // A tolerance-sized bridge counts as touching, so butt joints fuse too.
      if (spans[i].lo <= hi + COLLINEAR_TOL) {
        run.push(spans[i]);
        hi = Math.max(hi, spans[i].hi);
      } else {
        flush();
        run = [spans[i]];
        hi = spans[i].hi;
      }
    }
    flush();
  }

  // A thin wall lying inside a thicker parallel one is not a second wall — it
  // is the same wall. This is what makes a room drawn flush against the
  // exterior shell share that shell rather than doubling it up.
  const absorbed = new Map<ID, ID>();
  for (const thin of walls) {
    const lineThin = lineOf(thin);
    if (!lineThin) continue;
    for (const thick of walls) {
      if (thick.id === thin.id || thick.thickness <= thin.thickness + 1) continue;
      const lineThick = lineOf(thick);
      if (!lineThick) continue;
      // Same direction.
      if (Math.abs(lineThin.dx - lineThick.dx) > 1e-3 || Math.abs(lineThin.dy - lineThick.dy) > 1e-3) continue;
      // The thin centreline must fall within the thick wall's body.
      const across = Math.abs(lineThin.offset - lineThick.offset);
      if (across > (thick.thickness - thin.thickness) / 2 + COLLINEAR_TOL) continue;
      // And its run must be covered by the thick wall's run.
      const tLo = Math.min(along(lineThick, thin.a), along(lineThick, thin.b));
      const tHi = Math.max(along(lineThick, thin.a), along(lineThick, thin.b));
      const kLo = Math.min(along(lineThick, thick.a), along(lineThick, thick.b));
      const kHi = Math.max(along(lineThick, thick.a), along(lineThick, thick.b));
      if (tLo < kLo - COLLINEAR_TOL || tHi > kHi + COLLINEAR_TOL) continue;
      absorbed.set(thin.id, thick.id);
      break;
    }
  }

  if (merges.length === 0 && absorbed.size === 0) return project;

  const entities = { ...project.entities };
  const doomed = new Set<ID>();

  for (const m of merges) {
    const keepWall = entities[m.keep.id];
    if (!keepWall || keepWall.type !== 'wall') continue;

    const oldLength = wallLength(keepWall);
    const keepStart = keepWall.a;
    const merged: Wall = { ...keepWall, a: m.a, b: m.b };
    const newLength = wallLength(merged);
    entities[m.keep.id] = merged;

    // Re-parameterise the survivor's own openings onto the longer wall.
    const shift = dist(m.a, keepStart);
    const forward = dist(m.a, keepStart) <= dist(m.b, keepStart);
    for (const op of openingsOnWall(project, m.keep.id)) {
      const cur = entities[op.id];
      if (!cur || (cur.type !== 'door' && cur.type !== 'window')) continue;
      const alongOld = (forward ? op.t : 1 - op.t) * oldLength;
      entities[op.id] = { ...cur, t: newLength > 0 ? (shift + alongOld) / newLength : 0.5 };
    }

    for (const gone of m.absorb) {
      doomed.add(gone.id);
      // Move that wall's openings onto the survivor at the same world position.
      for (const op of openingsOnWall(project, gone.id)) {
        const cur = entities[op.id];
        if (!cur || (cur.type !== 'door' && cur.type !== 'window')) continue;
        const world = wallPointAt(gone, op.t);
        const t = newLength > 0 ? (along(lineOf(merged)!, world) - along(lineOf(merged)!, m.a)) / newLength : 0.5;
        entities[op.id] = { ...cur, wallId: m.keep.id, t: Math.max(0, Math.min(1, t)) };
      }
    }
  }

  // Fold the absorbed thin walls in, moving their openings onto the host.
  for (const [thinId, thickId] of absorbed) {
    if (doomed.has(thinId) || doomed.has(thickId)) continue;
    const host = entities[thickId];
    const thin = entities[thinId];
    if (!host || host.type !== 'wall' || !thin || thin.type !== 'wall') continue;
    const hostLine = lineOf(host);
    const hostLen = wallLength(host);
    if (!hostLine || hostLen <= 0) continue;
    for (const op of openingsOnWall(project, thinId)) {
      const cur = entities[op.id];
      if (!cur || (cur.type !== 'door' && cur.type !== 'window')) continue;
      const world = wallPointAt(thin, op.t);
      const tt = (along(hostLine, world) - along(hostLine, host.a)) / hostLen;
      entities[op.id] = { ...cur, wallId: thickId, t: Math.max(0, Math.min(1, Math.abs(tt))) };
    }
    doomed.add(thinId);
  }

  if (doomed.size === 0) return project;

  // Repoint every room at the surviving wall.
  const survivorOf = new Map<ID, ID>();
  for (const m of merges) for (const gone of m.absorb) survivorOf.set(gone.id, m.keep.id);
  for (const [thinId, thickId] of absorbed) survivorOf.set(thinId, thickId);

  for (const id of project.order) {
    const e = entities[id];
    if (!e || e.type !== 'room' || !e.wallIds) continue;
    const next = e.wallIds.map((w) => survivorOf.get(w) ?? w);
    if (next.some((w, i) => w !== e.wallIds![i])) entities[id] = { ...e, wallIds: next };
  }

  for (const id of doomed) delete entities[id];
  return { ...project, entities, order: project.order.filter((id) => !doomed.has(id)) };
}
