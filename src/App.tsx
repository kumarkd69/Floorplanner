import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from '@/types';
import { store, useStoreState } from '@/hooks/useStore';
import { useKeyboard } from '@/hooks/useKeyboard';
import { exportJSON, exportPDF, exportPNG, parseProjectFile, DEFAULT_EXPORT } from '@/export';
import { CanvasView, type CanvasHandle } from '@/components/CanvasView';
import { Toolbar } from '@/components/Toolbar';
import { Sidebar } from '@/components/Sidebar';
import { PropertiesPanel } from '@/components/PropertiesPanel';
import { StatusBar } from '@/components/StatusBar';
import { FloatingControls } from '@/components/FloatingControls';
import { MiniMap } from '@/components/MiniMap';
import { ContextMenu } from '@/components/ContextMenu';
import { NewProjectDialog } from '@/components/dialogs/NewProjectDialog';
import { ExportDialog } from '@/components/dialogs/ExportDialog';
import { SettingsDialog } from '@/components/dialogs/SettingsDialog';
import { ShortcutsDialog } from '@/components/dialogs/ShortcutsDialog';

const AUTOSAVE_KEY = 'floorplanner.autosave.v1';

type DialogId = 'new' | 'export' | 'settings' | 'help' | null;

export default function App() {
  const [handle, setHandle] = useState<CanvasHandle | null>(null);
  const [dialog, setDialog] = useState<DialogId>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const ui = useStoreState((s) => s.ui);
  const project = useStoreState((s) => s.project);

  /* ------------------------------------------------------- theme tokens */

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = ui.theme === 'dark' ? 'dark' : 'light';
    root.dataset.contrast = ui.highContrast ? 'high' : 'normal';
    root.dataset.cursor = ui.largeCursor ? 'large' : 'normal';
  }, [ui.theme, ui.highContrast, ui.largeCursor]);

  /* ---------------------------------------------------------- autosave */

  // Restore the last session once, before the first paint of real work.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY);
      if (!saved) return;
      store.replaceProject(parseProjectFile(saved), 'Restored session');
    } catch {
      // A corrupt autosave should never prevent the app from opening.
      localStorage.removeItem(AUTOSAVE_KEY);
    }
  }, []);

  useEffect(() => {
    // Debounced so a drag does not write to localStorage on every frame.
    const id = window.setTimeout(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ format: 'floorplanner/v1', project }));
      } catch {
        // Quota exceeded on a very large plan — autosave is best-effort.
      }
    }, 800);
    return () => clearTimeout(id);
  }, [project]);

  /* ------------------------------------------------------------ actions */

  const openFile = useCallback(() => fileInput.current?.click(), []);

  const onFileChosen = useCallback((file: File) => {
    file
      .text()
      .then((text) => {
        const next = parseProjectFile(text);
        store.replaceProject(next, `Opened ${file.name}`);
        handle?.controls.zoomToFit();
      })
      .catch((err: unknown) => {
        window.alert(`Could not open that file.\n\n${err instanceof Error ? err.message : String(err)}`);
      });
  }, [handle]);

  const createProjectFromDialog = useCallback(
    (next: Project) => {
      store.replaceProject(next, 'New plan');
      setDialog(null);
      // Wait a tick so the canvas has the new bounds before fitting.
      requestAnimationFrame(() => handle?.controls.zoomToFit());
    },
    [handle],
  );

  const keyboardActions = useMemo(
    () => ({
      zoomToFit: () => handle?.controls.zoomToFit(),
      zoomToSelection: () => handle?.controls.zoomToSelection(),
      zoomBy: (f: number) => handle?.controls.zoomBy(f),
      zoomTo100: () => handle?.controls.zoomTo100(),
      save: () => exportJSON(store.getState().project),
      open: openFile,
      exportPng: () => {
        const s = store.getState();
        void exportPNG(s.project, s.ui, DEFAULT_EXPORT);
      },
      print: () => {
        const s = store.getState();
        exportPDF(s.project, s.ui, DEFAULT_EXPORT);
      },
      newProject: () => setDialog('new'),
    }),
    [handle, openFile],
  );

  useKeyboard(keyboardActions);

  // Warn before losing unsaved work on a real navigation away.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (store.getState().history.length > 1) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const size = handle?.size ?? { width: 0, height: 0 };
  const hint = toolHint(ui.tool);

  return (
    <div className="app">
      <Toolbar
        onNew={() => setDialog('new')}
        onOpen={openFile}
        onExport={() => setDialog('export')}
        onPrint={keyboardActions.print}
        onSettings={() => setDialog('settings')}
        onHelp={() => setDialog('help')}
      />

      <div className="app__body">
        {ui.sidebarOpen && <Sidebar />}

        <main className="app__center">
          <CanvasView onReady={setHandle} />

          {handle && (
            <FloatingControls
              zoomBy={handle.controls.zoomBy}
              zoomToFit={handle.controls.zoomToFit}
              zoomToSelection={handle.controls.zoomToSelection}
              zoomTo100={handle.controls.zoomTo100}
            />
          )}

          {ui.showMinimap && <MiniMap canvasSize={size} />}

          {hint && <div className="hint">{hint}</div>}

          {handle?.api.contextMenu && (
            <ContextMenu state={handle.api.contextMenu} onClose={handle.api.closeContextMenu} />
          )}
        </main>

        {ui.propertiesOpen && <PropertiesPanel />}
      </div>

      <StatusBar readout={handle?.api.readout ?? { world: null, hint: null }} />

      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFileChosen(file);
          e.target.value = '';
        }}
      />

      {dialog === 'new' && (
        <NewProjectDialog onClose={() => setDialog(null)} onCreate={createProjectFromDialog} />
      )}
      {dialog === 'export' && (
        <ExportDialog project={project} ui={ui} onClose={() => setDialog(null)} />
      )}
      {dialog === 'settings' && <SettingsDialog onClose={() => setDialog(null)} />}
      {dialog === 'help' && <ShortcutsDialog onClose={() => setDialog(null)} />}
    </div>
  );
}

/** A one-line prompt so a freshly-picked tool never leaves the user guessing. */
function toolHint(tool: string): string | null {
  switch (tool) {
    case 'wall':
      return 'Click to start a wall, keep clicking to chain segments. Double-click or Esc to finish.';
    case 'wall-curved':
      return 'Click two points to draw a curved wall. Adjust the curvature in the inspector.';
    case 'room':
      return 'Click each corner. Click the first point again — or double-click — to close the room.';
    case 'door':
      return 'Click on a wall to drop a door. It snaps to the wall and cannot overlap other openings.';
    case 'window':
      return 'Click on a wall to place a window.';
    case 'furniture':
      return 'Pick an item from the library, then click to place it. You can also drag items onto the plan.';
    case 'dimension':
      return 'Click the start and end of the run you want to dimension.';
    case 'measure':
      return 'Click two points to measure. Nothing is added to the drawing.';
    case 'text':
      return 'Click where the annotation should sit.';
    default:
      return null;
  }
}
