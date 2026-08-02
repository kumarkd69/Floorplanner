import type { CanvasTheme } from '@/types';
import { store, useStoreState } from '@/hooks/useStore';
import { Button, IconButton } from './ui';
import {
  IconBlueprint,
  IconFit,
  IconGrid,
  IconLayers,
  IconMagnet,
  IconMinus,
  IconMoon,
  IconPlus,
  IconSun,
  IconTarget,
} from './Icons';

export interface ViewControlProps {
  zoomBy: (f: number) => void;
  zoomToFit: () => void;
  zoomToSelection: () => void;
  zoomTo100: () => void;
}

export function FloatingControls(props: ViewControlProps) {
  const ui = useStoreState((s) => s.ui);
  const scale = useStoreState((s) => s.viewport.scale);
  const hasSelection = ui.selection.length > 0;

  const themes: Array<{ id: CanvasTheme; label: string; Icon: React.ComponentType<{ size?: number }> }> = [
    { id: 'white', label: 'White paper', Icon: IconSun },
    { id: 'blueprint', label: 'Blueprint', Icon: IconBlueprint },
    { id: 'dark', label: 'Dark', Icon: IconMoon },
  ];

  return (
    <>
      <div className="floating floating--view" role="group" aria-label="View options">
        {themes.map(({ id, label, Icon }) => (
          <Button
            key={id}
            active={ui.theme === id}
            tip={label}
            aria-label={label}
            className="tip--right"
            onClick={() => store.setUI({ theme: id })}
          >
            <Icon size={15} />
          </Button>
        ))}
        <div style={{ height: 1, background: 'var(--border)', width: '100%', margin: '2px 0' }} />
        <Button
          active={ui.showGrid}
          tip="Grid · G"
          aria-label="Toggle grid"
          className="tip--right"
          onClick={() => store.setUI({ showGrid: !ui.showGrid })}
        >
          <IconGrid size={15} />
        </Button>
        <Button
          active={ui.snap.enabled}
          tip="Snapping · K"
          aria-label="Toggle snapping"
          className="tip--right"
          onClick={() => store.setUI({ snap: { ...ui.snap, enabled: !ui.snap.enabled } })}
        >
          <IconMagnet size={15} />
        </Button>
        <Button
          active={ui.showMinimap}
          tip="Minimap"
          aria-label="Toggle minimap"
          className="tip--right"
          onClick={() => store.setUI({ showMinimap: !ui.showMinimap })}
        >
          <IconLayers size={15} />
        </Button>
      </div>

      <div className="floating floating--zoom" role="group" aria-label="Zoom">
        <IconButton label="Zoom out" onClick={() => props.zoomBy(1 / 1.25)}>
          <IconMinus size={15} />
        </IconButton>
        <button
          type="button"
          className="floating__zoomval"
          title="Reset zoom"
          onClick={props.zoomTo100}
        >
          {formatZoom(scale)}
        </button>
        <IconButton label="Zoom in" onClick={() => props.zoomBy(1.25)}>
          <IconPlus size={15} />
        </IconButton>
        <IconButton label="Zoom to fit (1)" onClick={props.zoomToFit}>
          <IconFit size={15} />
        </IconButton>
        <IconButton
          label="Zoom to selection (2)"
          disabled={!hasSelection}
          onClick={props.zoomToSelection}
        >
          <IconTarget size={15} />
        </IconButton>
      </div>
    </>
  );
}

/**
 * Express zoom relative to a 1:20 reference rather than as a raw px/mm figure —
 * "100%" is meaningless for a drawing measured in metres.
 */
function formatZoom(scale: number): string {
  return `${Math.round((scale / 0.2) * 100)}%`;
}
