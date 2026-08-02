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
