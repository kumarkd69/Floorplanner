import { useEffect } from 'react';
import type { ToolId } from '@/types';
import { store } from '@/state/store';
import {
  alignSelection,
  copySelection,
  duplicateSelection,
  mirrorSelection,
  paste,
  rotateSelection,
  setHidden,
  setLocked,
} from '@/state/operations';

const TOOL_KEYS: Record<string, ToolId> = {
  v: 'select',
  h: 'pan',
  w: 'wall',
  c: 'wall-curved',
  r: 'room',
  d: 'door',
  n: 'window',
  f: 'furniture',
  m: 'dimension',
  l: 'measure',
  t: 'text',
};

export interface KeyboardActions {
  zoomToFit: () => void;
  zoomToSelection: () => void;
  zoomBy: (factor: number) => void;
  zoomTo100: () => void;
  save: () => void;
  open: () => void;
  exportPng: () => void;
  print: () => void;
  newProject: () => void;
}

function isTyping(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return (
    t.tagName === 'INPUT' ||
    t.tagName === 'TEXTAREA' ||
    t.tagName === 'SELECT' ||
    t.isContentEditable
  );
}

/** Global keyboard map. Mirrors Figma/AutoCAD conventions where they overlap. */
export function useKeyboard(actions: KeyboardActions) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      const s = store.getState();
      const sel = s.ui.selection;
      const key = e.key.toLowerCase();

      if (mod) {
        switch (key) {
          case 'z':
            e.preventDefault();
            e.shiftKey ? store.redo() : store.undo();
            return;
          case 'y':
            e.preventDefault();
            store.redo();
            return;
          case 'c':
            e.preventDefault();
            copySelection(s.project, sel);
            return;
          case 'v':
            e.preventDefault();
            paste(store);
            return;
          case 'x':
            e.preventDefault();
            copySelection(s.project, sel);
            store.deleteEntities(sel);
            return;
          case 'd':
            e.preventDefault();
            duplicateSelection(store, sel);
            return;
          case 'a':
            e.preventDefault();
            store.setSelection(
              s.project.order.filter((id) => {
                const en = s.project.entities[id];
                if (!en || en.locked || en.hidden) return false;
                const layer = s.project.layers.find((l) => l.id === en.layerId);
                return !layer || (layer.visible && !layer.locked);
              }),
            );
            return;
          case 'g':
            e.preventDefault();
            e.shiftKey ? store.ungroup(sel) : store.group(sel);
            return;
          case 's':
            e.preventDefault();
            actions.save();
            return;
          case 'o':
            e.preventDefault();
            actions.open();
            return;
          case 'n':
            e.preventDefault();
            actions.newProject();
            return;
          case 'p':
            e.preventDefault();
            actions.print();
            return;
          case 'l':
            e.preventDefault();
            setLocked(store, sel, !sel.every((id) => s.project.entities[id]?.locked));
            return;
          case 'h':
            e.preventDefault();
            setHidden(store, sel, true);
            return;
          case '0':
            e.preventDefault();
            actions.zoomTo100();
            return;
          case '=':
          case '+':
            e.preventDefault();
            actions.zoomBy(1.2);
            return;
          case '-':
            e.preventDefault();
            actions.zoomBy(1 / 1.2);
            return;
          case ']':
            e.preventDefault();
            store.reorder(sel, e.shiftKey ? 'front' : 'forward');
            return;
          case '[':
            e.preventDefault();
            store.reorder(sel, e.shiftKey ? 'back' : 'backward');
            return;
        }
        return;
      }

      // Plain keys.
      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          store.deleteEntities(sel);
          return;
        case 'Escape':
          store.setSelection([]);
          return;
        case 'Tab':
          e.preventDefault();
          store.setUI({ sidebarOpen: !s.ui.sidebarOpen, propertiesOpen: !s.ui.propertiesOpen });
          return;
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight': {
          if (sel.length === 0) return;
          e.preventDefault();
          const step = e.shiftKey ? s.project.gridSize : s.project.gridSize / 10;
          const d = {
            ArrowUp: { x: 0, y: -step },
            ArrowDown: { x: 0, y: step },
            ArrowLeft: { x: -step, y: 0 },
            ArrowRight: { x: step, y: 0 },
          }[e.key]!;
          store.commit(
            'Nudge',
            (p) => {
              const entities = { ...p.entities };
              for (const id of sel) {
                const en = entities[id];
                if (!en || en.locked) continue;
                entities[id] = nudge(en, d);
              }
              return { ...p, entities };
            },
            { coalesce: true, reflowRooms: true, weld: sel },
          );
          return;
        }
      }

      switch (key) {
        case 'g':
          e.preventDefault();
          store.setUI({ showGrid: !s.ui.showGrid });
          return;
        case 'k':
          e.preventDefault();
          store.setUI({ snap: { ...s.ui.snap, enabled: !s.ui.snap.enabled } });
          return;
        case 'e':
          e.preventDefault();
          actions.exportPng();
          return;
        case '1':
          actions.zoomToFit();
          return;
        case '2':
          actions.zoomToSelection();
          return;
        case '[':
          if (sel.length) rotateSelection(store, sel, -Math.PI / 2);
          return;
        case ']':
          if (sel.length) rotateSelection(store, sel, Math.PI / 2);
          return;
      }

      if (e.shiftKey) {
        // Shift-modified alignment shortcuts.
        const alignMap: Record<string, Parameters<typeof alignSelection>[2]> = {
          a: 'left',
          s: 'bottom',
          w: 'top',
          d: 'right',
        };
        if (alignMap[key] && sel.length > 1) {
          e.preventDefault();
          alignSelection(store, sel, alignMap[key]);
          return;
        }
        if (key === 'x' || key === 'y') {
          e.preventDefault();
          mirrorSelection(store, sel, key === 'x' ? 'x' : 'y');
          return;
        }
      }

      const tool = TOOL_KEYS[key];
      if (tool) {
        e.preventDefault();
        store.setTool(tool);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions]);
}

function nudge(e: import('@/types').Entity, d: { x: number; y: number }) {
  switch (e.type) {
    case 'wall':
      return { ...e, a: { x: e.a.x + d.x, y: e.a.y + d.y }, b: { x: e.b.x + d.x, y: e.b.y + d.y } };
    case 'room':
      return { ...e, polygon: e.polygon.map((p) => ({ x: p.x + d.x, y: p.y + d.y })) };
    case 'furniture':
      return { ...e, position: { x: e.position.x + d.x, y: e.position.y + d.y } };
    case 'dimension':
      return { ...e, points: e.points.map((p) => ({ x: p.x + d.x, y: p.y + d.y })) };
    case 'text':
      return { ...e, position: { x: e.position.x + d.x, y: e.position.y + d.y } };
    default:
      return e;
  }
}

export const SHORTCUTS: Array<{ group: string; items: Array<[string, string]> }> = [
  {
    group: 'Tools',
    items: [
      ['V', 'Select'],
      ['H', 'Pan'],
      ['W', 'Wall'],
      ['C', 'Curved wall'],
      ['R', 'Room'],
      ['D', 'Door'],
      ['N', 'Window'],
      ['F', 'Furniture'],
      ['M', 'Dimension'],
      ['L', 'Measure'],
      ['T', 'Text'],
    ],
  },
  {
    group: 'Edit',
    items: [
      ['⌘/Ctrl + Z', 'Undo'],
      ['⌘/Ctrl + ⇧ + Z', 'Redo'],
      ['⌘/Ctrl + C / V / X', 'Copy / Paste / Cut'],
      ['⌘/Ctrl + D', 'Duplicate'],
      ['⌘/Ctrl + A', 'Select all'],
      ['⌘/Ctrl + G', 'Group'],
      ['⌘/Ctrl + ⇧ + G', 'Ungroup'],
      ['⌘/Ctrl + L', 'Lock / unlock'],
      ['Delete', 'Delete'],
      ['Arrows', 'Nudge (⇧ = one grid step)'],
      ['[ / ]', 'Rotate 90°'],
      ['⇧ + X / Y', 'Mirror'],
    ],
  },
  {
    group: 'View',
    items: [
      ['1', 'Zoom to fit'],
      ['2', 'Zoom to selection'],
      ['⌘/Ctrl + 0', 'Zoom 1:20'],
      ['Space + drag', 'Pan'],
      ['G', 'Toggle grid'],
      ['K', 'Toggle snapping'],
      ['Tab', 'Toggle panels'],
    ],
  },
  {
    group: 'File',
    items: [
      ['⌘/Ctrl + N', 'New plan'],
      ['⌘/Ctrl + S', 'Save JSON'],
      ['⌘/Ctrl + O', 'Open JSON'],
      ['E', 'Export PNG'],
      ['⌘/Ctrl + P', 'Print / PDF'],
    ],
  },
];
