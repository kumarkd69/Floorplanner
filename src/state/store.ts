import type {
  Entity,
  HistoryEntry,
  ID,
  Project,
  UIState,
  Viewport,
} from '@/types';
import { uid } from '@/core/id';
import { DEFAULT_SNAP } from '@/core/snapping';
import { syncAutoRooms } from '@/core/rooms';
import { fuseCollinearWalls, weldWallJoints } from '@/core/wallOps';
import { createSampleProject } from './project';

export interface AppState {
  project: Project;
  ui: UIState;
  viewport: Viewport;
  history: HistoryEntry[];
  historyIndex: number;
}

export interface CommitOptions {
  /** Rebuild auto-detected rooms after the change (wall edits need this). */
  reflowRooms?: boolean;
  /** Weld wall endpoints; pass the ids that moved. */
  weld?: ID[];
  /**
   * Fuse walls that ended up lying on the same line, so two rooms placed side
   * by side share one wall instead of stacking two.
   */
  fuse?: boolean;
  /**
   * Fold into the previous history entry instead of pushing a new one — used
   * for continuous gestures so a drag is one undo step, not two hundred.
   */
  coalesce?: boolean;
  /** Change nothing in history (live previews during a drag). */
  transient?: boolean;
}

const MAX_HISTORY = 200;

const DEFAULT_UI: UIState = {
  tool: 'select',
  selection: [],
  hoverId: null,
  theme: 'white',
  showGrid: true,
  showRulers: true,
  showMinimap: true,
  showDimensions: true,
  showRoomLabels: true,
  highContrast: false,
  largeCursor: false,
  snap: DEFAULT_SNAP,
  activeCatalogId: null,
  activePresetId: null,
  sidebarTab: 'rooms',
  sidebarOpen: true,
  propertiesOpen: true,
};

type Listener = () => void;

/**
 * A minimal observable store.
 *
 * We deliberately avoid a reducer/context stack: the canvas needs to read the
 * newest state synchronously inside pointer handlers (React state batching
 * would lag a drag by a frame), and `useSyncExternalStore` lets panels
 * subscribe with correct tearing semantics while the canvas reads directly.
 */
export class Store {
  private state: AppState;
  private listeners = new Set<Listener>();

  constructor(project?: Project) {
    const p = project ?? createSampleProject();
    this.state = {
      project: p,
      ui: { ...DEFAULT_UI },
      viewport: { x: 0, y: 0, scale: 0.05 },
      history: [{ label: 'New plan', project: p, at: Date.now() }],
      historyIndex: 0,
    };
  }

  getState = (): AppState => this.state;

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  private emit() {
    for (const fn of this.listeners) fn();
  }

  private set(next: Partial<AppState>) {
    this.state = { ...this.state, ...next };
    this.emit();
  }

  /* ------------------------------------------------------------- project */

  /**
   * Apply a change to the project and record it.
   *
   * All mutations funnel through here so that welding, room reflow, and history
   * are impossible to forget at a call site.
   */
  commit(label: string, mutate: (p: Project) => Project, opts: CommitOptions = {}) {
    let next = mutate(this.state.project);
    if (next === this.state.project) return;

    if (opts.weld && opts.weld.length > 0) next = weldWallJoints(next, opts.weld);
    // Fusing before room reflow so detection sees the final wall set.
    if (opts.fuse) next = fuseCollinearWalls(next);
    if (opts.reflowRooms) next = syncAutoRooms(next);
    next = { ...next, updatedAt: new Date().toISOString() };

    if (opts.transient) {
      this.set({ project: next });
      return;
    }

    const history = this.state.history.slice(0, this.state.historyIndex + 1);
    const last = history[history.length - 1];
    if (opts.coalesce && last && last.label === label) {
      history[history.length - 1] = { label, project: next, at: Date.now() };
      this.set({ project: next, history, historyIndex: history.length - 1 });
      return;
    }

    history.push({ label, project: next, at: Date.now() });
    while (history.length > MAX_HISTORY) history.shift();
    this.set({ project: next, history, historyIndex: history.length - 1 });
  }

  /** Record the current project as a history step without changing it. */
  checkpoint(label: string) {
    this.commit(label, (p) => ({ ...p }));
  }

  replaceProject(project: Project, label = 'Open project') {
    this.state = {
      ...this.state,
      project,
      ui: { ...this.state.ui, selection: [], hoverId: null },
      history: [{ label, project, at: Date.now() }],
      historyIndex: 0,
    };
    this.emit();
  }

  /* ------------------------------------------------------------- history */

  canUndo = () => this.state.historyIndex > 0;
  canRedo = () => this.state.historyIndex < this.state.history.length - 1;

  undo() {
    if (!this.canUndo()) return;
    const idx = this.state.historyIndex - 1;
    this.set({
      historyIndex: idx,
      project: this.state.history[idx].project,
      ui: { ...this.state.ui, selection: this.pruneSelection(this.state.history[idx].project) },
    });
  }

  redo() {
    if (!this.canRedo()) return;
    const idx = this.state.historyIndex + 1;
    this.set({
      historyIndex: idx,
      project: this.state.history[idx].project,
      ui: { ...this.state.ui, selection: this.pruneSelection(this.state.history[idx].project) },
    });
  }

  /** Jump to any point in the history timeline. */
  gotoHistory(index: number) {
    if (index < 0 || index >= this.state.history.length) return;
    this.set({
      historyIndex: index,
      project: this.state.history[index].project,
      ui: { ...this.state.ui, selection: this.pruneSelection(this.state.history[index].project) },
    });
  }

  private pruneSelection(project: Project): ID[] {
    return this.state.ui.selection.filter((id) => project.entities[id]);
  }

  /* ------------------------------------------------------------------ ui */

  setUI(patch: Partial<UIState>) {
    this.set({ ui: { ...this.state.ui, ...patch } });
  }

  /**
   * Switch tools.
   *
   * Tools are strictly exclusive: leaving a tool disarms whatever it had armed
   * and notifies listeners so any half-finished drawing on the canvas is
   * abandoned. Without this, picking the wall tool and then another tool left
   * the wall rubber-banding behind the new tool.
   */
  setTool(tool: UIState['tool']) {
    if (this.state.ui.tool === tool) return;
    this.setUI({
      tool,
      selection: tool === 'select' ? this.state.ui.selection : [],
      // Only the furniture tool keeps something armed, and only its own kind.
      activeCatalogId: tool === 'furniture' ? this.state.ui.activeCatalogId : null,
      activePresetId: tool === 'furniture' ? this.state.ui.activePresetId : null,
    });
  }

  setSelection(ids: ID[]) {
    const cur = this.state.ui.selection;
    if (cur.length === ids.length && cur.every((id, i) => id === ids[i])) return;
    this.setUI({ selection: ids });
  }

  toggleSelection(id: ID, additive: boolean) {
    const cur = this.state.ui.selection;
    if (!additive) {
      this.setSelection([id]);
      return;
    }
    this.setSelection(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }

  setHover(id: ID | null) {
    if (this.state.ui.hoverId === id) return;
    this.setUI({ hoverId: id });
  }

  /* ------------------------------------------------------------ viewport */

  setViewport(patch: Partial<Viewport>) {
    const next = { ...this.state.viewport, ...patch };
    if (
      next.x === this.state.viewport.x &&
      next.y === this.state.viewport.y &&
      next.scale === this.state.viewport.scale
    ) {
      return;
    }
    this.set({ viewport: next });
  }

  /* ------------------------------------------------------------ entities */

  addEntities(label: string, entities: Entity[], opts: CommitOptions = {}) {
    this.commit(
      label,
      (p) => {
        const next = { ...p, entities: { ...p.entities }, order: [...p.order] };
        for (const e of entities) {
          next.entities[e.id] = e;
          next.order.push(e.id);
        }
        return next;
      },
      opts,
    );
  }

  updateEntity<T extends Entity>(label: string, id: ID, patch: Partial<T>, opts: CommitOptions = {}) {
    this.commit(
      label,
      (p) => {
        const cur = p.entities[id];
        if (!cur) return p;
        return { ...p, entities: { ...p.entities, [id]: { ...cur, ...patch } as Entity } };
      },
      opts,
    );
  }

  updateEntities(
    label: string,
    updates: Array<{ id: ID; patch: Partial<Entity> }>,
    opts: CommitOptions = {},
  ) {
    this.commit(
      label,
      (p) => {
        const entities = { ...p.entities };
        for (const u of updates) {
          const cur = entities[u.id];
          if (cur) entities[u.id] = { ...cur, ...u.patch } as Entity;
        }
        return { ...p, entities };
      },
      opts,
    );
  }

  /** Delete entities, cascading to openings hosted on deleted walls. */
  deleteEntities(ids: ID[]) {
    if (ids.length === 0) return;
    this.commit(
      ids.length === 1 ? 'Delete' : `Delete ${ids.length} items`,
      (p) => {
        const doomed = new Set(ids);
        for (const id of ids) {
          const e = p.entities[id];
          if (e?.type === 'wall') {
            for (const other of Object.values(p.entities)) {
              if ((other.type === 'door' || other.type === 'window') && other.wallId === id) {
                doomed.add(other.id);
              }
            }
          }
        }
        const entities = { ...p.entities };
        for (const id of doomed) delete entities[id];
        return { ...p, entities, order: p.order.filter((id) => !doomed.has(id)) };
      },
      { reflowRooms: true },
    );
    this.setSelection([]);
  }

  /* -------------------------------------------------------------- groups */

  group(ids: ID[]) {
    if (ids.length < 2) return;
    const gid = uid('grp');
    this.commit('Group', (p) => {
      const entities = { ...p.entities };
      for (const id of ids) {
        const e = entities[id];
        if (e) entities[id] = { ...e, groupId: gid } as Entity;
      }
      return {
        ...p,
        entities,
        groups: { ...p.groups, [gid]: { id: gid, name: `Group ${Object.keys(p.groups).length + 1}`, memberIds: [...ids] } },
      };
    });
  }

  ungroup(ids: ID[]) {
    const gids = new Set<ID>();
    for (const id of ids) {
      const e = this.state.project.entities[id];
      if (e?.groupId) gids.add(e.groupId);
    }
    if (gids.size === 0) return;
    this.commit('Ungroup', (p) => {
      const entities = { ...p.entities };
      const groups = { ...p.groups };
      for (const gid of gids) {
        const g = groups[gid];
        if (!g) continue;
        for (const m of g.memberIds) {
          const e = entities[m];
          if (e) {
            const { groupId: _drop, ...rest } = e;
            entities[m] = rest as Entity;
          }
        }
        delete groups[gid];
      }
      return { ...p, entities, groups };
    });
  }

  /* ------------------------------------------------------------- z-order */

  reorder(ids: ID[], direction: 'front' | 'back' | 'forward' | 'backward') {
    if (ids.length === 0) return;
    this.commit('Reorder', (p) => {
      const set = new Set(ids);
      const moving = p.order.filter((id) => set.has(id));
      const rest = p.order.filter((id) => !set.has(id));
      if (direction === 'front') return { ...p, order: [...rest, ...moving] };
      if (direction === 'back') return { ...p, order: [...moving, ...rest] };

      const order = [...p.order];
      const indices = order.map((id, i) => ({ id, i })).filter((x) => set.has(x.id));
      if (direction === 'forward') {
        for (let k = indices.length - 1; k >= 0; k--) {
          const i = order.indexOf(indices[k].id);
          if (i < order.length - 1 && !set.has(order[i + 1])) {
            [order[i], order[i + 1]] = [order[i + 1], order[i]];
          }
        }
      } else {
        for (let k = 0; k < indices.length; k++) {
          const i = order.indexOf(indices[k].id);
          if (i > 0 && !set.has(order[i - 1])) {
            [order[i], order[i - 1]] = [order[i - 1], order[i]];
          }
        }
      }
      return { ...p, order };
    });
  }

  /* -------------------------------------------------------------- layers */

  updateLayer(id: ID, patch: Partial<AppState['project']['layers'][number]>) {
    this.commit('Layer change', (p) => ({
      ...p,
      layers: p.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }));
  }

  moveLayer(id: ID, delta: number) {
    this.commit('Reorder layers', (p) => {
      const layers = [...p.layers];
      const i = layers.findIndex((l) => l.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= layers.length) return p;
      [layers[i], layers[j]] = [layers[j], layers[i]];
      return { ...p, layers };
    });
  }

  setProjectMeta(patch: Partial<Project>) {
    this.commit('Project settings', (p) => ({ ...p, ...patch }));
  }
}

export const store = new Store();
