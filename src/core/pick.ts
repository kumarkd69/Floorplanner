import type { Entity, ID, Project, Vec2 } from '@/types';
import { entityBounds, hitTestEntity, isSelectable } from './entities';
import { rectContainsRect, rectsIntersect, type Rect } from './geometry';

/** Priority when several entities overlap — small, precise things win. */
const PICK_RANK: Record<Entity['type'], number> = {
  door: 6,
  window: 6,
  dimension: 5,
  text: 5,
  furniture: 4,
  wall: 3,
  room: 1,
};

/**
 * Topmost entity at a world point.
 *
 * Ranking by type rather than pure z-order means clicking a door in a wall
 * selects the door, and clicking inside a room never steals a click from the
 * furniture sitting on it — the behaviour users expect from Figma-style hit
 * testing.
 */
export function pickEntity(
  project: Project,
  world: Vec2,
  tol: number,
  opts?: { types?: Entity['type'][]; includeLocked?: boolean },
): Entity | null {
  let best: Entity | null = null;
  let bestRank = -Infinity;

  for (let i = project.order.length - 1; i >= 0; i--) {
    const e = project.entities[project.order[i]];
    if (!e) continue;
    if (opts?.types && !opts.types.includes(e.type)) continue;
    if (!opts?.includeLocked && !isSelectable(e, project)) continue;
    if (!hitTestEntity(e, world, tol, project)) continue;
    // Later entities of equal rank win, preserving z-order within a type.
    const rank = PICK_RANK[e.type] * 1000 + i;
    if (rank > bestRank) {
      bestRank = rank;
      best = e;
    }
  }
  return best;
}

/**
 * Marquee selection.
 *
 * Dragging right-to-left ("crossing") selects anything the box touches;
 * left-to-right ("window") selects only fully enclosed items. That is the
 * AutoCAD convention and it is genuinely useful once learned.
 */
export function pickInRect(
  project: Project,
  rect: Rect,
  crossing: boolean,
  opts?: { types?: Entity['type'][] },
): ID[] {
  const out: ID[] = [];
  for (const id of project.order) {
    const e = project.entities[id];
    if (!e) continue;
    if (opts?.types && !opts.types.includes(e.type)) continue;
    if (!isSelectable(e, project)) continue;
    const b = entityBounds(e, project);
    if (crossing ? rectsIntersect(rect, b) : rectContainsRect(rect, b)) out.push(id);
  }
  return out;
}
