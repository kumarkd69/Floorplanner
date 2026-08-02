import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Dimension,
  Door,
  Entity,
  Furniture,
  ID,
  Project,
  TextNote,
  Vec2,
  Wall,
  WindowOpening,
} from '@/types';
import {
  add,
  angleOf,
  dist,
  mul,
  normalizeAngle,
  rectCenter,
  rectFromCorners,
  sub,
} from '@/core/geometry';
import {
  clampOpeningT,
  entityBounds,
  openingFits,
  openingsOnWall,
  openingsOverlap,
  selectionBounds,
  wallLength,
  wallParamAt,
} from '@/core/entities';
import { pickEntity, pickInRect } from '@/core/pick';
import { alignmentSnap, snapPoint } from '@/core/snapping';
import { moveWallEndpoint, splitWall } from '@/core/wallOps';
import { makeRoom } from '@/core/rooms';
import { formatAngle, formatLength } from '@/core/units';
import { uid } from '@/core/id';
import { CATALOG_BY_ID } from '@/data/catalog';
import { layerIdFor } from '@/state/project';
import { translateEntity } from '@/state/operations';
import { store } from '@/state/store';
import {
  hitHandle,
  screenToWorld,
  type HandleId,
  type Overlay,
} from '@/render/renderer';

/** Pixels the pointer must travel before a click becomes a drag. */
const DRAG_THRESHOLD = 3;

type Interaction =
  | { kind: 'none' }
  | { kind: 'pan'; last: Vec2 }
  | { kind: 'maybe-drag'; start: Vec2; worldStart: Vec2; ids: ID[]; additive: boolean; hitId: ID }
  | { kind: 'move'; worldStart: Vec2; origins: Map<ID, Entity>; last: Vec2 }
  | { kind: 'marquee'; start: Vec2 }
  | { kind: 'resize'; handle: HandleId; anchor: Vec2; origins: Map<ID, Entity>; startBounds: { x: number; y: number; w: number; h: number } }
  | { kind: 'rotate'; pivot: Vec2; startAngle: number; origins: Map<ID, Entity> }
  | { kind: 'wall-endpoint'; wallId: ID; which: 'a' | 'b' }
  | { kind: 'draw-wall'; points: Vec2[]; bulge: number }
  | { kind: 'draw-room'; points: Vec2[] }
  | { kind: 'draw-dimension'; points: Vec2[]; final: number }
  | { kind: 'measure'; points: Vec2[] }
  | { kind: 'opening-drag'; id: ID };

export interface ContextMenuState {
  screen: Vec2;
  world: Vec2;
  targetId: ID | null;
}

export interface InteractionApi {
  overlay: Overlay;
  cursor: string;
  contextMenu: ContextMenuState | null;
  closeContextMenu: () => void;
  /** Status-bar readout: cursor position and any live measurement. */
  readout: { world: Vec2 | null; hint: string | null };
  onPointerDown: (ev: React.PointerEvent) => void;
  onPointerMove: (ev: React.PointerEvent) => void;
  onPointerUp: (ev: React.PointerEvent) => void;
  onDoubleClick: (ev: React.MouseEvent) => void;
  onContextMenu: (ev: React.MouseEvent) => void;
  cancel: () => void;
  /** Drop a catalog item at a screen point (drag & drop from the library). */
  dropFurniture: (catalogId: string, screen: Vec2) => void;
}

export function useCanvasInteraction(canvas: HTMLCanvasElement | null): InteractionApi {
  const interaction = useRef<Interaction>({ kind: 'none' });
  /**
   * The document as it stood when the current gesture began.
   *
   * Drags commit transiently — they mutate the project without pushing history
   * so a gesture collapses into one undo step. That means Escape cannot use
   * `undo()` to abandon a drag: there is no history entry for it, so undo would
   * throw away whatever the user did *before* the drag instead. Restoring this
   * snapshot is the only correct way to cancel.
   */
  const gestureStart = useRef<Project | null>(null);
  const spaceDown = useRef(false);
  const [overlay, setOverlay] = useState<Overlay>({});
  const [cursor, setCursor] = useState('default');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [readout, setReadout] = useState<{ world: Vec2 | null; hint: string | null }>({
    world: null,
    hint: null,
  });

  /* ------------------------------------------------------------ helpers */

  const toScreen = useCallback(
    (ev: { clientX: number; clientY: number }): Vec2 => {
      if (!canvas) return { x: 0, y: 0 };
      const r = canvas.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    },
    [canvas],
  );

  const toWorld = useCallback(
    (ev: { clientX: number; clientY: number }): Vec2 =>
      screenToWorld(toScreen(ev), store.getState().viewport),
    [toScreen],
  );

  const snapCtx = useCallback((exclude?: Set<ID>, origin?: Vec2 | null) => {
    const s = store.getState();
    return {
      project: s.project,
      settings: s.ui.snap,
      worldPerPx: 1 / s.viewport.scale,
      exclude,
      origin,
    };
  }, []);

  const worldTol = useCallback((px = 6) => px / store.getState().viewport.scale, []);

  /* --------------------------------------------------------- space to pan */

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTypingTarget(e.target)) {
        spaceDown.current = true;
        setCursor('grab');
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDown.current = false;
        setCursor('default');
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const cancel = useCallback(() => {
    interaction.current = { kind: 'none' };
    gestureStart.current = null;
    setOverlay({});
    setContextMenu(null);
  }, []);

  /* ---------------------------------------------------------- placement */

  const placeFurnitureAt = useCallback((catalogId: string, world: Vec2) => {
    const item = CATALOG_BY_ID.get(catalogId);
    if (!item) return;
    const s = store.getState();
    const snapped = snapPoint(world, snapCtx());
    const f: Furniture = {
      id: uid('furn'),
      type: 'furniture',
      layerId: layerIdFor(s.project, item.layerKind ?? 'furniture'),
      catalogId,
      position: snapped.point,
      width: item.width,
      depth: item.depth,
      rotation: 0,
      flipX: false,
      flipY: false,
      locked: false,
      hidden: false,
    };
    store.addEntities(`Add ${item.name}`, [f]);
    store.setSelection([f.id]);
  }, [snapCtx]);

  const dropFurniture = useCallback(
    (catalogId: string, screen: Vec2) => {
      placeFurnitureAt(catalogId, screenToWorld(screen, store.getState().viewport));
    },
    [placeFurnitureAt],
  );

  /** Insert a door or window on the wall nearest the point. */
  const placeOpening = useCallback(
    (world: Vec2, kind: 'door' | 'window'): boolean => {
      const s = store.getState();
      const wall = pickEntity(s.project, world, worldTol(24), { types: ['wall'] });
      if (!wall || wall.type !== 'wall') return false;

      const isDoor = kind === 'door';
      const width = isDoor ? (s.project.unit === 'ft' ? 914.4 : 900) : s.project.unit === 'ft' ? 1219.2 : 1200;
      if (!openingFits(width, wall)) return false;

      const t = clampOpeningT(width, wall, wallParamAt(wall, world).t);
      const clash = openingsOnWall(s.project, wall.id).some((o) =>
        openingsOverlap({ t, width }, { t: o.t, width: o.width }, wall),
      );
      if (clash) return false;

      const entity: Door | WindowOpening = isDoor
        ? {
            id: uid('door'),
            type: 'door',
            layerId: layerIdFor(s.project, 'walls'),
            wallId: wall.id,
            t,
            width,
            height: s.project.unit === 'ft' ? 2032 : 2100,
            kind: 'single',
            swing: 'left',
            direction: 'in',
            frame: 'Timber',
            material: 'Flush panel',
            locked: false,
            hidden: false,
          }
        : {
            id: uid('win'),
            type: 'window',
            layerId: layerIdFor(s.project, 'walls'),
            wallId: wall.id,
            t,
            width,
            height: s.project.unit === 'ft' ? 1219.2 : 1200,
            sill: s.project.unit === 'ft' ? 914.4 : 900,
            kind: 'sliding',
            glass: 'Double glazed',
            frame: 'Aluminium',
            locked: false,
            hidden: false,
          };

      store.addEntities(isDoor ? 'Add door' : 'Add window', [entity]);
      store.setSelection([entity.id]);
      return true;
    },
    [worldTol],
  );

  /* --------------------------------------------------------- pointer down */

  const onPointerDown = useCallback(
    (ev: React.PointerEvent) => {
      if (!canvas) return;
      setContextMenu(null);
      const s = store.getState();
      const screen = toScreen(ev);
      const world = screenToWorld(screen, s.viewport);
      const tool = s.ui.tool;

      // Middle mouse or space always pans, whatever the active tool.
      if (ev.button === 1 || spaceDown.current || tool === 'pan') {
        canvas.setPointerCapture(ev.pointerId);
        interaction.current = { kind: 'pan', last: screen };
        setCursor('grabbing');
        return;
      }
      if (ev.button !== 0) return;

      canvas.setPointerCapture(ev.pointerId);

      switch (tool) {
        case 'wall':
        case 'wall-curved': {
          const cur = interaction.current;
          const snapped = snapPoint(
            world,
            snapCtx(undefined, cur.kind === 'draw-wall' ? cur.points[cur.points.length - 1] : null),
          );
          if (cur.kind === 'draw-wall') {
            commitWallSegment(cur.points[cur.points.length - 1], snapped.point, cur.bulge, tool === 'wall-curved');
            // Chain: the new segment's end becomes the next start.
            interaction.current = { kind: 'draw-wall', points: [snapped.point], bulge: 0 };
          } else {
            interaction.current = { kind: 'draw-wall', points: [snapped.point], bulge: 0 };
          }
          return;
        }
        case 'room': {
          const cur = interaction.current;
          const snapped = snapPoint(world, snapCtx());
          if (cur.kind === 'draw-room') {
            // Closing the loop by clicking the first point finishes the room.
            if (cur.points.length >= 3 && dist(snapped.point, cur.points[0]) < worldTol(12)) {
              commitRoom(cur.points);
              interaction.current = { kind: 'none' };
              setOverlay({});
              return;
            }
            interaction.current = { kind: 'draw-room', points: [...cur.points, snapped.point] };
          } else {
            interaction.current = { kind: 'draw-room', points: [snapped.point] };
          }
          return;
        }
        case 'door':
        case 'window': {
          placeOpening(world, tool);
          return;
        }
        case 'furniture': {
          if (s.ui.activeCatalogId) placeFurnitureAt(s.ui.activeCatalogId, world);
          return;
        }
        case 'dimension':
        case 'measure': {
          const cur = interaction.current;
          const snapped = snapPoint(world, snapCtx());
          if (cur.kind === 'draw-dimension') {
            const points = [...cur.points, snapped.point];
            if (points.length >= 2) {
              commitDimension(points);
              interaction.current = { kind: 'none' };
              setOverlay({});
            }
            return;
          }
          if (cur.kind === 'measure') {
            interaction.current = { kind: 'none' };
            setOverlay({});
            return;
          }
          interaction.current =
            tool === 'measure'
              ? { kind: 'measure', points: [snapped.point] }
              : { kind: 'draw-dimension', points: [snapped.point], final: 2 };
          return;
        }
        case 'text': {
          const text = window.prompt('Annotation text');
          if (text) {
            const note: TextNote = {
              id: uid('text'),
              type: 'text',
              layerId: layerIdFor(s.project, 'annotations'),
              position: world,
              text,
              size: 250,
              rotation: 0,
              locked: false,
              hidden: false,
            };
            store.addEntities('Add note', [note]);
            store.setSelection([note.id]);
            store.setTool('select');
          }
          return;
        }
      }

      /* --------------------------------------------------- select tool */

      const handle = hitHandle(s.project, s.ui.selection, screen, s.viewport);
      if (handle) {
        const origins = snapshot(s.ui.selection);
        gestureStart.current = s.project;
        if (handle === 'rotate') {
          const b = selectionBounds(s.project, s.ui.selection)!;
          const pivot = rectCenter(b);
          interaction.current = {
            kind: 'rotate',
            pivot,
            startAngle: angleOf(sub(world, pivot)),
            origins,
          };
        } else if (handle === 'wall-a' || handle === 'wall-b') {
          interaction.current = {
            kind: 'wall-endpoint',
            wallId: s.ui.selection[0],
            which: handle === 'wall-a' ? 'a' : 'b',
          };
        } else {
          const b = selectionBounds(s.project, s.ui.selection)!;
          interaction.current = {
            kind: 'resize',
            handle,
            anchor: anchorFor(handle, b),
            origins,
            startBounds: b,
          };
        }
        return;
      }

      const hit = pickEntity(s.project, world, worldTol());
      const additive = ev.shiftKey || ev.ctrlKey || ev.metaKey;

      if (!hit) {
        if (!additive) store.setSelection([]);
        interaction.current = { kind: 'marquee', start: world };
        return;
      }

      // Dragging a door/window slides it along its host wall.
      if ((hit.type === 'door' || hit.type === 'window') && !additive) {
        if (!s.ui.selection.includes(hit.id)) store.setSelection([hit.id]);
        gestureStart.current = s.project;
        interaction.current = { kind: 'opening-drag', id: hit.id };
        return;
      }

      // Group members select as a unit unless the user is picking explicitly.
      let ids = [hit.id];
      if (hit.groupId && !additive) {
        const g = s.project.groups[hit.groupId];
        if (g) ids = g.memberIds.filter((m) => s.project.entities[m]);
      }

      if (additive) {
        store.toggleSelection(hit.id, true);
      } else if (!s.ui.selection.includes(hit.id)) {
        store.setSelection(ids);
      }

      interaction.current = {
        kind: 'maybe-drag',
        start: screen,
        worldStart: world,
        ids: store.getState().ui.selection,
        additive,
        hitId: hit.id,
      };
    },
    [canvas, placeFurnitureAt, placeOpening, snapCtx, toScreen, worldTol],
  );

  /* --------------------------------------------------------- pointer move */

  const onPointerMove = useCallback(
    (ev: React.PointerEvent) => {
      const s = store.getState();
      const screen = toScreen(ev);
      const world = screenToWorld(screen, s.viewport);
      const cur = interaction.current;
      setReadout((r) => ({ ...r, world }));

      switch (cur.kind) {
        case 'pan': {
          const dx = screen.x - cur.last.x;
          const dy = screen.y - cur.last.y;
          store.setViewport({
            x: s.viewport.x - dx / s.viewport.scale,
            y: s.viewport.y - dy / s.viewport.scale,
          });
          interaction.current = { kind: 'pan', last: screen };
          return;
        }

        case 'maybe-drag': {
          if (dist(screen, cur.start) < DRAG_THRESHOLD) return;
          const origins = snapshot(cur.ids);
          gestureStart.current = s.project;
          interaction.current = {
            kind: 'move',
            worldStart: cur.worldStart,
            origins,
            last: cur.worldStart,
          };
          return;
        }

        case 'move': {
          const ids = [...cur.origins.keys()];
          const exclude = new Set(ids);
          let delta = sub(world, cur.worldStart);

          // Snap the dragged bounds, then look for alignment with the rest.
          const startBounds = boundsOf(cur.origins, s.project);
          if (startBounds) {
            const movedCenter = add(rectCenter(startBounds), delta);
            const half = { x: startBounds.w / 2, y: startBounds.h / 2 };
            const align = alignmentSnap(movedCenter, half, snapCtx(exclude));
            delta = add(delta, align.delta);

            const gridSnap = snapPoint(add(rectCenter(startBounds), delta), snapCtx(exclude));
            if (gridSnap.kinds.length > 0 && align.guides.length === 0) {
              delta = sub(gridSnap.point, rectCenter(startBounds));
            }
            setOverlay({
              guides: align.guides,
              callouts: [
                {
                  at: add(rectCenter(startBounds), delta),
                  text: `Δ ${formatLength(delta.x, s.project.unit, { compact: true })}, ${formatLength(
                    delta.y,
                    s.project.unit,
                    { compact: true },
                  )}`,
                },
              ],
            });
          }

          // Re-apply from the original snapshot so the drag never accumulates.
          store.commit(
            'Move',
            (p) => {
              const entities = { ...p.entities };
              for (const [id, original] of cur.origins) {
                if (original.locked) continue;
                entities[id] = translateEntity(original, delta);
              }
              return { ...p, entities };
            },
            { transient: true },
          );
          interaction.current = { ...cur, last: world };
          return;
        }

        case 'marquee': {
          setOverlay({ marquee: { a: cur.start, b: world } });
          return;
        }

        case 'resize': {
          const b = cur.startBounds;
          const anchor = cur.anchor;
          const wantW = Math.abs(world.x - anchor.x);
          const wantH = Math.abs(world.y - anchor.y);
          let sx = b.w > 1 ? wantW / b.w : 1;
          let sy = b.h > 1 ? wantH / b.h : 1;
          if (cur.handle === 'n' || cur.handle === 's') sx = 1;
          if (cur.handle === 'e' || cur.handle === 'w') sy = 1;
          // Corner handles keep aspect unless Shift asks for free scaling.
          if (['nw', 'ne', 'se', 'sw'].includes(cur.handle) && !ev.shiftKey) {
            const u = Math.max(sx, sy);
            sx = u;
            sy = u;
          }
          sx = clampScaleFactor(sx);
          sy = clampScaleFactor(sy);

          store.commit(
            'Resize',
            (p) => {
              const entities = { ...p.entities };
              for (const [id, original] of cur.origins) {
                if (original.locked) continue;
                entities[id] = scaleEntity(original, anchor, sx, sy);
              }
              return { ...p, entities };
            },
            { transient: true },
          );
          setOverlay({
            callouts: [
              {
                at: world,
                text: `${formatLength(b.w * sx, s.project.unit, { compact: true })} × ${formatLength(
                  b.h * sy,
                  s.project.unit,
                  { compact: true },
                )}`,
              },
            ],
          });
          return;
        }

        case 'rotate': {
          let angle = angleOf(sub(world, cur.pivot)) - cur.startAngle;
          // Shift constrains to 15° steps.
          if (ev.shiftKey || s.ui.snap.angle) {
            const step = (15 * Math.PI) / 180;
            if (ev.shiftKey) angle = Math.round(angle / step) * step;
          }
          store.commit(
            'Rotate',
            (p) => {
              const entities = { ...p.entities };
              for (const [id, original] of cur.origins) {
                if (original.locked) continue;
                entities[id] = rotateEntity(original, cur.pivot, angle);
              }
              return { ...p, entities };
            },
            { transient: true },
          );
          setOverlay({ callouts: [{ at: world, text: formatAngle(normalizeAngle(angle)) }] });
          return;
        }

        case 'wall-endpoint': {
          const snapped = snapPoint(world, snapCtx(new Set([cur.wallId])));
          store.commit('Edit wall', (p) => moveWallEndpoint(p, cur.wallId, cur.which, snapped.point), {
            transient: true,
          });
          const wall = store.getState().project.entities[cur.wallId];
          setOverlay({
            snap: snapped,
            callouts:
              wall && wall.type === 'wall'
                ? [{ at: world, text: formatLength(wallLength(wall), s.project.unit) }]
                : [],
          });
          return;
        }

        case 'opening-drag': {
          const op = s.project.entities[cur.id];
          if (!op || (op.type !== 'door' && op.type !== 'window')) return;
          const wall = s.project.entities[op.wallId];
          if (!wall || wall.type !== 'wall') return;
          const t = clampOpeningT(op.width, wall, wallParamAt(wall, world).t);
          const clash = openingsOnWall(s.project, wall.id).some(
            (o) => o.id !== op.id && openingsOverlap({ t, width: op.width }, { t: o.t, width: o.width }, wall),
          );
          if (!clash) {
            store.updateEntity('Move opening', cur.id, { t }, { transient: true });
          }
          setOverlay({
            hostWallId: wall.id,
            callouts: [
              {
                at: world,
                text: `${formatLength(t * wallLength(wall), s.project.unit)} from start`,
              },
            ],
          });
          return;
        }

        case 'draw-wall': {
          const origin = cur.points[cur.points.length - 1];
          const snapped = snapPoint(world, snapCtx(undefined, origin));
          const bulge = s.ui.tool === 'wall-curved' ? 0.25 : 0;
          const length = dist(origin, snapped.point);
          const ang = angleOf(sub(snapped.point, origin));
          setOverlay({
            snap: snapped,
            draft: {
              kind: 'wall',
              points: [origin, snapped.point],
              bulge,
              thickness: s.project.wallDefaults.interiorThickness,
            },
            callouts: [
              {
                at: snapped.point,
                text: `${formatLength(length, s.project.unit)}   ${formatAngle(ang)}`,
              },
            ],
          });
          setReadout({ world, hint: `${formatLength(length, s.project.unit)} @ ${formatAngle(ang)}` });
          return;
        }

        case 'draw-room': {
          const snapped = snapPoint(world, snapCtx(undefined, cur.points[cur.points.length - 1]));
          setOverlay({
            snap: snapped,
            draft: { kind: 'room', points: [...cur.points, snapped.point] },
          });
          return;
        }

        case 'draw-dimension':
        case 'measure': {
          const snapped = snapPoint(world, snapCtx(undefined, cur.points[0]));
          const length = dist(cur.points[0], snapped.point);
          setOverlay({
            snap: snapped,
            draft: { kind: cur.kind === 'measure' ? 'measure' : 'dimension', points: [...cur.points, snapped.point] },
            callouts: [{ at: snapped.point, text: formatLength(length, s.project.unit) }],
          });
          setReadout({ world, hint: formatLength(length, s.project.unit) });
          return;
        }

        default:
          break;
      }

      /* ------------------------------------------------ idle hover state */

      if (s.ui.tool === 'select') {
        const handle = hitHandle(s.project, s.ui.selection, screen, s.viewport);
        if (handle) {
          setCursor(handle === 'rotate' ? 'grab' : handleCursor(handle));
          store.setHover(null);
          return;
        }
        const hit = pickEntity(s.project, world, worldTol());
        store.setHover(hit?.id ?? null);
        setCursor(hit ? 'move' : 'default');
        setOverlay({});
        return;
      }

      if (s.ui.tool === 'door' || s.ui.tool === 'window') {
        const wall = pickEntity(s.project, world, worldTol(24), { types: ['wall'] });
        setOverlay({ hostWallId: wall?.id ?? null });
        setCursor(wall ? 'copy' : 'not-allowed');
        return;
      }

      if (s.ui.tool === 'furniture' && s.ui.activeCatalogId) {
        const snapped = snapPoint(world, snapCtx());
        setOverlay({
          snap: snapped,
          draft: { kind: 'furniture', points: [snapped.point], catalogId: s.ui.activeCatalogId },
        });
        setCursor('copy');
        return;
      }

      setCursor(s.ui.tool === 'pan' ? 'grab' : 'crosshair');
    },
    [snapCtx, toScreen, worldTol],
  );

  /* ----------------------------------------------------------- pointer up */

  const onPointerUp = useCallback(
    (ev: React.PointerEvent) => {
      const s = store.getState();
      const world = toWorld(ev);
      const cur = interaction.current;

      // The gesture is over: whatever it produced is now the committed state.
      if (cur.kind !== 'pan') gestureStart.current = null;

      switch (cur.kind) {
        case 'pan':
          interaction.current = { kind: 'none' };
          setCursor(spaceDown.current ? 'grab' : 'default');
          return;

        case 'maybe-drag': {
          // A click without movement on an already-selected item narrows the
          // selection to just that item.
          if (!cur.additive && s.ui.selection.length > 1) {
            const e = s.project.entities[cur.hitId];
            if (e && !e.groupId) store.setSelection([cur.hitId]);
          }
          interaction.current = { kind: 'none' };
          return;
        }

        case 'move': {
          const ids = [...cur.origins.keys()];
          const hasWall = ids.some((id) => s.project.entities[id]?.type === 'wall');
          // Re-commit as a real history entry now the gesture is over.
          store.commit('Move', (p) => ({ ...p }), { weld: hasWall ? ids : undefined, reflowRooms: hasWall });
          interaction.current = { kind: 'none' };
          setOverlay({});
          return;
        }

        case 'marquee': {
          const rect = rectFromCorners(cur.start, world);
          if (rect.w > 1 || rect.h > 1) {
            // Right-to-left drag = crossing selection.
            const crossing = world.x < cur.start.x;
            const ids = pickInRect(s.project, rect, crossing);
            const additive = ev.shiftKey || ev.ctrlKey || ev.metaKey;
            store.setSelection(additive ? [...new Set([...s.ui.selection, ...ids])] : ids);
          }
          interaction.current = { kind: 'none' };
          setOverlay({});
          return;
        }

        case 'resize':
          store.commit('Resize', (p) => ({ ...p }), { reflowRooms: true });
          interaction.current = { kind: 'none' };
          setOverlay({});
          return;

        case 'rotate':
          store.commit('Rotate', (p) => ({ ...p }), { reflowRooms: true });
          interaction.current = { kind: 'none' };
          setOverlay({});
          return;

        case 'wall-endpoint':
          store.commit('Edit wall', (p) => ({ ...p }), { weld: [cur.wallId], reflowRooms: true });
          interaction.current = { kind: 'none' };
          setOverlay({});
          return;

        case 'opening-drag':
          store.commit('Move opening', (p) => ({ ...p }));
          interaction.current = { kind: 'none' };
          setOverlay({});
          return;

        default:
          return;
      }
    },
    [toWorld],
  );

  /* ------------------------------------------------------------- gestures */

  const onDoubleClick = useCallback(
    (ev: React.MouseEvent) => {
      const s = store.getState();
      const world = toWorld(ev);
      const cur = interaction.current;

      // Double-click ends a chained wall or an open room polygon.
      if (cur.kind === 'draw-wall') {
        interaction.current = { kind: 'none' };
        setOverlay({});
        return;
      }
      if (cur.kind === 'draw-room') {
        if (cur.points.length >= 3) commitRoom(cur.points);
        interaction.current = { kind: 'none' };
        setOverlay({});
        return;
      }

      const hit = pickEntity(s.project, world, worldTol());
      if (!hit) return;

      if (hit.type === 'room') {
        const name = window.prompt('Room name', hit.name);
        if (name) store.updateEntity('Rename room', hit.id, { name, renamed: true });
        return;
      }
      if (hit.type === 'text') {
        const text = window.prompt('Edit annotation', hit.text);
        if (text !== null) store.updateEntity('Edit note', hit.id, { text });
        return;
      }
      if (hit.type === 'wall') {
        // Double-clicking a wall splits it at that point — the fastest way to
        // introduce a junction.
        store.commit('Split wall', (p) => splitWall(p, hit.id, world), { reflowRooms: true });
        return;
      }
      // Everything else: open the inspector on it.
      store.setSelection([hit.id]);
      store.setUI({ propertiesOpen: true });
    },
    [toWorld, worldTol],
  );

  const onContextMenu = useCallback(
    (ev: React.MouseEvent) => {
      ev.preventDefault();
      const s = store.getState();
      const world = toWorld(ev);
      const hit = pickEntity(s.project, world, worldTol());
      if (hit && !s.ui.selection.includes(hit.id)) store.setSelection([hit.id]);
      setContextMenu({ screen: { x: ev.clientX, y: ev.clientY }, world, targetId: hit?.id ?? null });
    },
    [toWorld, worldTol],
  );

  /* ------------------------------------------------------------- commits */

  function commitWallSegment(a: Vec2, b: Vec2, bulge: number, curved: boolean) {
    if (dist(a, b) < 1) return;
    const s = store.getState();
    const wall: Wall = {
      id: uid('wall'),
      type: 'wall',
      layerId: layerIdFor(s.project, 'walls'),
      a,
      b,
      bulge: curved ? (bulge || 0.25) : 0,
      thickness: s.project.wallDefaults.interiorThickness,
      height: s.project.wallDefaults.height,
      material: s.project.wallDefaults.material,
      exterior: false,
      locked: false,
      hidden: false,
    };
    store.addEntities('Draw wall', [wall], { weld: [wall.id], reflowRooms: true });
  }

  function commitRoom(points: Vec2[]) {
    if (points.length < 3) return;
    const s = store.getState();
    const names = Object.values(s.project.entities)
      .filter((e): e is Extract<Entity, { type: 'room' }> => e.type === 'room')
      .map((r) => r.name);
    const room = makeRoom(points, layerIdFor(s.project, 'rooms'), names, false);
    store.addEntities('Draw room', [room]);
    store.setSelection([room.id]);
  }

  function commitDimension(points: Vec2[]) {
    const s = store.getState();
    const dim: Dimension = {
      id: uid('dim'),
      type: 'dimension',
      layerId: layerIdFor(s.project, 'dimensions'),
      kind: 'linear',
      points,
      offset: s.project.unit === 'ft' ? 457.2 : 450,
      locked: false,
      hidden: false,
    };
    store.addEntities('Add dimension', [dim]);
    store.setSelection([dim.id]);
  }

  /* ------------------------------------------------------------ escape */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const original = gestureStart.current;
      if (original) {
        // Put the document back exactly as it was, without touching history.
        store.commit('Cancel', () => original, { transient: true });
        gestureStart.current = null;
      }
      cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cancel]);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // Memoised: `CanvasView` publishes this object to its parent from a layout
  // effect, so a fresh identity on every render would loop set-state forever.
  return useMemo(
    () => ({
      overlay,
      cursor,
      contextMenu,
      closeContextMenu,
      readout,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onDoubleClick,
      onContextMenu,
      cancel,
      dropFurniture,
    }),
    [
      overlay,
      cursor,
      contextMenu,
      closeContextMenu,
      readout,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onDoubleClick,
      onContextMenu,
      cancel,
      dropFurniture,
    ],
  );
}

/* --------------------------------------------------------------- helpers */

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable || t.tagName === 'SELECT';
}

function snapshot(ids: ID[]): Map<ID, Entity> {
  const p = store.getState().project;
  const m = new Map<ID, Entity>();
  for (const id of ids) {
    const e = p.entities[id];
    if (e) m.set(id, e);
  }
  return m;
}

function boundsOf(origins: Map<ID, Entity>, project: { entities: Record<ID, Entity>; layers: unknown[] }) {
  let out: { x: number; y: number; w: number; h: number } | null = null;
  for (const e of origins.values()) {
    const b = entityBounds(e, project as never);
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

function anchorFor(handle: HandleId, b: { x: number; y: number; w: number; h: number }): Vec2 {
  switch (handle) {
    case 'nw':
      return { x: b.x + b.w, y: b.y + b.h };
    case 'n':
      return { x: b.x + b.w / 2, y: b.y + b.h };
    case 'ne':
      return { x: b.x, y: b.y + b.h };
    case 'e':
      return { x: b.x, y: b.y + b.h / 2 };
    case 'se':
      return { x: b.x, y: b.y };
    case 's':
      return { x: b.x + b.w / 2, y: b.y };
    case 'sw':
      return { x: b.x + b.w, y: b.y };
    case 'w':
      return { x: b.x + b.w, y: b.y + b.h / 2 };
    default:
      return { x: b.x, y: b.y };
  }
}

function clampScaleFactor(s: number): number {
  return Math.max(0.02, Math.min(50, s));
}

function scaleEntity(e: Entity, anchor: Vec2, sx: number, sy: number): Entity {
  const map = (p: Vec2): Vec2 => ({
    x: anchor.x + (p.x - anchor.x) * sx,
    y: anchor.y + (p.y - anchor.y) * sy,
  });
  switch (e.type) {
    case 'wall':
      return { ...e, a: map(e.a), b: map(e.b) };
    case 'room':
      return { ...e, polygon: e.polygon.map(map) };
    case 'furniture':
      // Scale along the item's own axes so a rotated item resizes sensibly.
      return {
        ...e,
        position: map(e.position),
        width: Math.max(50, e.width * sx),
        depth: Math.max(50, e.depth * sy),
      };
    case 'dimension':
      return { ...e, points: e.points.map(map) };
    case 'text':
      return { ...e, position: map(e.position), size: Math.max(30, e.size * ((sx + sy) / 2)) };
    default:
      return e;
  }
}

function rotateEntity(e: Entity, pivot: Vec2, angle: number): Entity {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const map = (p: Vec2): Vec2 => {
    const dx = p.x - pivot.x;
    const dy = p.y - pivot.y;
    return { x: pivot.x + dx * c - dy * s, y: pivot.y + dx * s + dy * c };
  };
  switch (e.type) {
    case 'wall':
      return { ...e, a: map(e.a), b: map(e.b) };
    case 'room':
      return { ...e, polygon: e.polygon.map(map) };
    case 'furniture':
      return { ...e, position: map(e.position), rotation: e.rotation + angle };
    case 'dimension':
      return { ...e, points: e.points.map(map) };
    case 'text':
      return { ...e, position: map(e.position), rotation: e.rotation + angle };
    default:
      return e;
  }
}

function handleCursor(h: HandleId): string {
  const map: Record<string, string> = {
    nw: 'nwse-resize',
    se: 'nwse-resize',
    ne: 'nesw-resize',
    sw: 'nesw-resize',
    n: 'ns-resize',
    s: 'ns-resize',
    e: 'ew-resize',
    w: 'ew-resize',
  };
  return map[h] ?? 'move';
}

export { add, mul };
