import type { Entity, ID, Project, Vec2 } from '@/types';
import { uid } from '@/core/id';
import { add, rectCenter, rotate as rotatePt, sub, type Rect } from '@/core/geometry';
import { entityBounds, selectionBounds } from '@/core/entities';
import type { Store } from './store';

/* ---------------------------------------------------------- transforms */

type PointMap = (p: Vec2) => Vec2;

/**
 * Apply a point transform to an entity.
 *
 * Openings are deliberately *not* transformed: they are parameterised on their
 * host wall, so moving the wall carries them automatically and transforming
 * them here would double-apply the motion.
 */
export function transformEntity(e: Entity, map: PointMap, rotationDelta = 0, scale = 1): Entity {
  switch (e.type) {
    case 'wall':
      return { ...e, a: map(e.a), b: map(e.b), thickness: e.thickness * scale };
    case 'room':
      return { ...e, polygon: e.polygon.map(map) };
    case 'furniture':
      return {
        ...e,
        position: map(e.position),
        rotation: e.rotation + rotationDelta,
        width: e.width * scale,
        depth: e.depth * scale,
      };
    case 'dimension':
      return { ...e, points: e.points.map(map) };
    case 'text':
      return { ...e, position: map(e.position), rotation: e.rotation + rotationDelta };
    case 'plot':
      // A plot is axis-aligned by definition: it translates but never rotates.
      return { ...e, ...mapRectOrigin(e, map), width: e.width * scale, height: e.height * scale };
    case 'door':
    case 'window':
      return e;
  }
}

function mapRectOrigin(e: { x: number; y: number }, map: PointMap): { x: number; y: number } {
  return map({ x: e.x, y: e.y });
}

export function translateEntity(e: Entity, delta: Vec2): Entity {
  return transformEntity(e, (p) => add(p, delta));
}

export function moveSelection(
  store: Store,
  ids: ID[],
  delta: Vec2,
  opts: { coalesce?: boolean; transient?: boolean } = {},
) {
  if (ids.length === 0 || (delta.x === 0 && delta.y === 0)) return;
  const wallIds = ids.filter((id) => store.getState().project.entities[id]?.type === 'wall');
  store.commit(
    'Move',
    (p) => {
      const entities = { ...p.entities };
      for (const id of ids) {
        const e = entities[id];
        if (!e || e.locked) continue;
        entities[id] = translateEntity(e, delta);
      }
      return { ...p, entities };
    },
    { coalesce: opts.coalesce, transient: opts.transient, weld: wallIds, reflowRooms: wallIds.length > 0 },
  );
}

export function rotateSelection(store: Store, ids: ID[], angle: number, pivot?: Vec2) {
  if (ids.length === 0) return;
  const project = store.getState().project;
  const bounds = selectionBounds(project, ids);
  if (!bounds) return;
  const origin = pivot ?? rectCenter(bounds);
  store.commit(
    'Rotate',
    (p) => {
      const entities = { ...p.entities };
      for (const id of ids) {
        const e = entities[id];
        if (!e || e.locked) continue;
        entities[id] = transformEntity(e, (pt) => rotatePt(pt, angle, origin), angle);
      }
      return { ...p, entities };
    },
    { reflowRooms: true, weld: ids },
  );
}

export function scaleSelection(store: Store, ids: ID[], factor: number, pivot?: Vec2) {
  if (ids.length === 0 || factor <= 0) return;
  const project = store.getState().project;
  const bounds = selectionBounds(project, ids);
  if (!bounds) return;
  const origin = pivot ?? rectCenter(bounds);
  store.commit(
    'Scale',
    (p) => {
      const entities = { ...p.entities };
      for (const id of ids) {
        const e = entities[id];
        if (!e || e.locked) continue;
        entities[id] = transformEntity(
          e,
          (pt) => add(origin, { x: (pt.x - origin.x) * factor, y: (pt.y - origin.y) * factor }),
          0,
          factor,
        );
      }
      return { ...p, entities };
    },
    { reflowRooms: true, weld: ids },
  );
}

/** Mirror the selection across its own bounding-box axis. */
export function mirrorSelection(store: Store, ids: ID[], axis: 'x' | 'y') {
  if (ids.length === 0) return;
  const project = store.getState().project;
  const bounds = selectionBounds(project, ids);
  if (!bounds) return;
  const c = rectCenter(bounds);
  store.commit(
    `Mirror ${axis === 'x' ? 'horizontal' : 'vertical'}`,
    (p) => {
      const entities = { ...p.entities };
      for (const id of ids) {
        const e = entities[id];
        if (!e || e.locked) continue;
        const map: PointMap =
          axis === 'x' ? (pt) => ({ x: 2 * c.x - pt.x, y: pt.y }) : (pt) => ({ x: pt.x, y: 2 * c.y - pt.y });
        let next = transformEntity(e, map);
        if (next.type === 'furniture') {
          // Mirroring a box flips its symbol and negates its rotation about the
          // mirror axis; storing that as flip + angle keeps the size positive.
          next = {
            ...next,
            rotation: axis === 'x' ? -next.rotation : Math.PI - next.rotation,
            flipX: axis === 'x' ? !next.flipX : next.flipX,
            flipY: axis === 'y' ? !next.flipY : next.flipY,
          };
        }
        if (next.type === 'room') next = { ...next, polygon: [...next.polygon].reverse() };
        entities[id] = next;
      }
      return { ...p, entities };
    },
    { reflowRooms: true, weld: ids },
  );
}

/* ------------------------------------------------------------ duplicate */

/** Deep-copy entities with fresh ids, remapping wall references and groups. */
export function cloneEntities(
  project: Project,
  ids: ID[],
  offset: Vec2 = { x: 0, y: 0 },
): Entity[] {
  const idMap = new Map<ID, ID>();
  const set = new Set(ids);
  // Openings follow their wall only when that wall is part of the copy.
  for (const id of ids) {
    const e = project.entities[id];
    if (!e) continue;
    if ((e.type === 'door' || e.type === 'window') && !set.has(e.wallId)) continue;
    idMap.set(id, uid(e.type));
  }

  const groupMap = new Map<ID, ID>();
  const out: Entity[] = [];
  for (const [oldId, newId] of idMap) {
    const e = project.entities[oldId];
    let copy: Entity = { ...translateEntity(e, offset), id: newId } as Entity;
    if (copy.type === 'door' || copy.type === 'window') {
      copy = { ...copy, wallId: idMap.get(copy.wallId) ?? copy.wallId };
    }
    if (copy.type === 'room') copy = { ...copy, auto: false };
    if (e.groupId) {
      if (!groupMap.has(e.groupId)) groupMap.set(e.groupId, uid('grp'));
      copy = { ...copy, groupId: groupMap.get(e.groupId) } as Entity;
    }
    out.push(copy);
  }
  return out;
}

export function duplicateSelection(store: Store, ids: ID[], offset?: Vec2): ID[] {
  const project = store.getState().project;
  const step = offset ?? { x: project.gridSize, y: project.gridSize };
  const copies = cloneEntities(project, ids, step);
  if (copies.length === 0) return [];
  store.commit(
    'Duplicate',
    (p) => {
      const entities = { ...p.entities };
      const order = [...p.order];
      const groups = { ...p.groups };
      for (const c of copies) {
        entities[c.id] = c;
        order.push(c.id);
        if (c.groupId) {
          const g = groups[c.groupId];
          groups[c.groupId] = g
            ? { ...g, memberIds: [...g.memberIds, c.id] }
            : { id: c.groupId, name: 'Group copy', memberIds: [c.id] };
        }
      }
      return { ...p, entities, order, groups };
    },
    { reflowRooms: copies.some((c) => c.type === 'wall') },
  );
  const newIds = copies.map((c) => c.id);
  store.setSelection(newIds);
  return newIds;
}

/* ------------------------------------------------------ align & distribute */

export type AlignMode = 'left' | 'right' | 'top' | 'bottom' | 'center-h' | 'center-v';

export function alignSelection(store: Store, ids: ID[], mode: AlignMode) {
  if (ids.length < 2) return;
  const project = store.getState().project;
  const boxes = ids
    .map((id) => ({ id, e: project.entities[id] }))
    .filter((x) => x.e && !x.e.locked)
    .map((x) => ({ id: x.id, rect: entityBounds(x.e!, project) }));
  if (boxes.length < 2) return;

  const total = boxes.reduce<Rect | null>((acc, b) => {
    if (!acc) return b.rect;
    const x = Math.min(acc.x, b.rect.x);
    const y = Math.min(acc.y, b.rect.y);
    return {
      x,
      y,
      w: Math.max(acc.x + acc.w, b.rect.x + b.rect.w) - x,
      h: Math.max(acc.y + acc.h, b.rect.y + b.rect.h) - y,
    };
  }, null)!;

  store.commit(
    'Align',
    (p) => {
      const entities = { ...p.entities };
      for (const b of boxes) {
        let dx = 0;
        let dy = 0;
        switch (mode) {
          case 'left':
            dx = total.x - b.rect.x;
            break;
          case 'right':
            dx = total.x + total.w - (b.rect.x + b.rect.w);
            break;
          case 'center-h':
            dx = total.x + total.w / 2 - (b.rect.x + b.rect.w / 2);
            break;
          case 'top':
            dy = total.y - b.rect.y;
            break;
          case 'bottom':
            dy = total.y + total.h - (b.rect.y + b.rect.h);
            break;
          case 'center-v':
            dy = total.y + total.h / 2 - (b.rect.y + b.rect.h / 2);
            break;
        }
        const e = entities[b.id];
        if (e) entities[b.id] = translateEntity(e, { x: dx, y: dy });
      }
      return { ...p, entities };
    },
    { reflowRooms: true, weld: ids },
  );
}

export function distributeSelection(store: Store, ids: ID[], axis: 'h' | 'v') {
  if (ids.length < 3) return;
  const project = store.getState().project;
  const boxes = ids
    .map((id) => ({ id, e: project.entities[id] }))
    .filter((x) => x.e && !x.e.locked)
    .map((x) => ({ id: x.id, rect: entityBounds(x.e!, project) }));
  if (boxes.length < 3) return;

  const key = axis === 'h' ? 'x' : 'y';
  const size = axis === 'h' ? 'w' : 'h';
  boxes.sort((a, b) => a.rect[key] - b.rect[key]);

  const first = boxes[0];
  const last = boxes[boxes.length - 1];
  const span = last.rect[key] + last.rect[size] - first.rect[key];
  const totalSize = boxes.reduce((s, b) => s + b.rect[size], 0);
  const gap = (span - totalSize) / (boxes.length - 1);

  store.commit(
    'Distribute',
    (p) => {
      const entities = { ...p.entities };
      let cursor = first.rect[key] + first.rect[size] + gap;
      for (let i = 1; i < boxes.length - 1; i++) {
        const b = boxes[i];
        const delta = cursor - b.rect[key];
        const e = entities[b.id];
        if (e) entities[b.id] = translateEntity(e, axis === 'h' ? { x: delta, y: 0 } : { x: 0, y: delta });
        cursor += b.rect[size] + gap;
      }
      return { ...p, entities };
    },
    { reflowRooms: true, weld: ids },
  );
}

/* ------------------------------------------------------------ clipboard */

interface Clipboard {
  entities: Entity[];
  origin: Vec2;
}

let clipboard: Clipboard | null = null;

export function copySelection(project: Project, ids: ID[]) {
  const entities = cloneEntities(project, ids);
  if (entities.length === 0) return;
  const bounds = selectionBounds(project, ids);
  clipboard = { entities, origin: bounds ? rectCenter(bounds) : { x: 0, y: 0 } };
}

export function hasClipboard(): boolean {
  return !!clipboard && clipboard.entities.length > 0;
}

/** Paste at `at` (world mm), or offset by one grid step when no point given. */
export function paste(store: Store, at?: Vec2): ID[] {
  if (!clipboard) return [];
  const project = store.getState().project;
  const delta = at ? sub(at, clipboard.origin) : { x: project.gridSize, y: project.gridSize };

  // Re-key on every paste so repeated pastes never collide.
  const idMap = new Map<ID, ID>();
  for (const e of clipboard.entities) idMap.set(e.id, uid(e.type));
  const copies = clipboard.entities.map((e) => {
    let c = { ...translateEntity(e, delta), id: idMap.get(e.id)! } as Entity;
    if (c.type === 'door' || c.type === 'window') {
      c = { ...c, wallId: idMap.get(c.wallId) ?? c.wallId };
    }
    return c;
  });

  store.commit(
    'Paste',
    (p) => {
      const entities = { ...p.entities };
      const order = [...p.order];
      for (const c of copies) {
        entities[c.id] = c;
        order.push(c.id);
      }
      return { ...p, entities, order };
    },
    { reflowRooms: copies.some((c) => c.type === 'wall') },
  );

  const ids = copies.map((c) => c.id);
  store.setSelection(ids);
  return ids;
}

/* --------------------------------------------------------------- toggles */

export function setLocked(store: Store, ids: ID[], locked: boolean) {
  store.updateEntities(
    locked ? 'Lock' : 'Unlock',
    ids.map((id) => ({ id, patch: { locked } })),
  );
}

export function setHidden(store: Store, ids: ID[], hidden: boolean) {
  store.updateEntities(
    hidden ? 'Hide' : 'Show',
    ids.map((id) => ({ id, patch: { hidden } })),
  );
}
