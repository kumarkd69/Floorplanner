import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ID } from '@/types';
import { store, useStoreState } from '@/hooks/useStore';
import {
  copySelection,
  duplicateSelection,
  hasClipboard,
  mirrorSelection,
  paste,
  rotateSelection,
  setHidden,
  setLocked,
} from '@/state/operations';
import { splitWall } from '@/core/wallOps';
import type { ContextMenuState } from '@/hooks/useCanvasInteraction';

export function ContextMenu({ state, onClose }: { state: ContextMenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const project = useStoreState((s) => s.project);
  const selection = useStoreState((s) => s.ui.selection);
  const [pos, setPos] = useState(state.screen);

  // Keep the menu on screen when opened near an edge.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.min(state.screen.x, window.innerWidth - r.width - 8),
      y: Math.min(state.screen.y, window.innerHeight - r.height - 8),
    });
  }, [state.screen]);

  useEffect(() => {
    const close = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const target = state.targetId ? project.entities[state.targetId] : null;
  const ids: ID[] = selection.length > 0 ? selection : state.targetId ? [state.targetId] : [];
  const has = ids.length > 0;
  const allLocked = has && ids.every((id) => project.entities[id]?.locked);

  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <div className="menu" ref={ref} style={{ left: pos.x, top: pos.y }} role="menu">
      {has ? (
        <>
          <Item label="Copy" keys="⌘C" onClick={run(() => copySelection(project, ids))} />
          <Item label="Duplicate" keys="⌘D" onClick={run(() => duplicateSelection(store, ids))} />
          <Item
            label="Paste here"
            keys="⌘V"
            disabled={!hasClipboard()}
            onClick={run(() => paste(store, state.world))}
          />
          <Separator />
          <Item label="Rotate 90° clockwise" keys="]" onClick={run(() => rotateSelection(store, ids, Math.PI / 2))} />
          <Item label="Rotate 90° anticlockwise" keys="[" onClick={run(() => rotateSelection(store, ids, -Math.PI / 2))} />
          <Item label="Mirror horizontally" keys="⇧X" onClick={run(() => mirrorSelection(store, ids, 'x'))} />
          <Item label="Mirror vertically" keys="⇧Y" onClick={run(() => mirrorSelection(store, ids, 'y'))} />
          <Separator />
          <Item label="Bring to front" keys="⌘⇧]" onClick={run(() => store.reorder(ids, 'front'))} />
          <Item label="Bring forward" keys="⌘]" onClick={run(() => store.reorder(ids, 'forward'))} />
          <Item label="Send backward" keys="⌘[" onClick={run(() => store.reorder(ids, 'backward'))} />
          <Item label="Send to back" keys="⌘⇧[" onClick={run(() => store.reorder(ids, 'back'))} />
          <Separator />
          {ids.length > 1 && <Item label="Group" keys="⌘G" onClick={run(() => store.group(ids))} />}
          {ids.some((id) => project.entities[id]?.groupId) && (
            <Item label="Ungroup" keys="⌘⇧G" onClick={run(() => store.ungroup(ids))} />
          )}
          <Item
            label={allLocked ? 'Unlock' : 'Lock'}
            keys="⌘L"
            onClick={run(() => setLocked(store, ids, !allLocked))}
          />
          <Item label="Hide" keys="⌘H" onClick={run(() => setHidden(store, ids, true))} />
          {target?.type === 'wall' && (
            <>
              <Separator />
              <Item
                label="Split wall here"
                onClick={run(() =>
                  store.commit('Split wall', (p) => splitWall(p, target.id, state.world), {
                    reflowRooms: true,
                  }),
                )}
              />
            </>
          )}
          {target?.type === 'room' && (
            <>
              <Separator />
              <Item
                label="Rename room…"
                onClick={run(() => {
                  const name = window.prompt('Room name', target.name);
                  if (name) store.updateEntity('Rename room', target.id, { name, renamed: true });
                })}
              />
            </>
          )}
          <Separator />
          <Item label="Delete" keys="Del" danger onClick={run(() => store.deleteEntities(ids))} />
        </>
      ) : (
        <>
          <Item
            label="Paste here"
            keys="⌘V"
            disabled={!hasClipboard()}
            onClick={run(() => paste(store, state.world))}
          />
          <Item
            label="Select all"
            keys="⌘A"
            onClick={run(() =>
              store.setSelection(
                project.order.filter((id) => {
                  const e = project.entities[id];
                  return e && !e.locked && !e.hidden;
                }),
              ),
            )}
          />
          <Separator />
          <Item label="Toggle grid" keys="G" onClick={run(() => store.setUI({ showGrid: !store.getState().ui.showGrid }))} />
          <Item
            label="Toggle snapping"
            keys="K"
            onClick={run(() => {
              const s = store.getState().ui.snap;
              store.setUI({ snap: { ...s, enabled: !s.enabled } });
            })}
          />
        </>
      )}
    </div>
  );
}

function Item({
  label,
  keys,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  keys?: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`menu__item ${danger ? 'menu__item--danger' : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
      {keys && <span className="menu__key">{keys}</span>}
    </button>
  );
}

function Separator() {
  return <div className="menu__sep" role="separator" />;
}
