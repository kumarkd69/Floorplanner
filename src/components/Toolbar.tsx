import type { ToolId } from '@/types';
import { store, useHistory, useStoreState } from '@/hooks/useStore';
import { duplicateSelection } from '@/state/operations';
import { Button } from './ui';
import {
  IconCopy,
  IconCurve,
  IconCursor,
  IconDoor,
  IconDownload,
  IconFile,
  IconGroup,
  IconHand,
  IconHelp,
  IconLogo,
  IconMeasure,
  IconPlot,
  IconPrint,
  IconRedo,
  IconRoom,
  IconRuler,
  IconSettings,
  IconSofa,
  IconText,
  IconTrash,
  IconUndo,
  IconUpload,
  IconWall,
  IconWindow,
} from './Icons';

const TOOLS: Array<{ id: ToolId; label: string; key: string; Icon: React.ComponentType<{ size?: number }> }> = [
  { id: 'select', label: 'Select', key: 'V', Icon: IconCursor },
  { id: 'pan', label: 'Pan', key: 'H', Icon: IconHand },
  { id: 'plot', label: 'Plot / floor', key: 'P', Icon: IconPlot },
  { id: 'wall', label: 'Wall', key: 'W', Icon: IconWall },
  { id: 'wall-curved', label: 'Curved wall', key: 'C', Icon: IconCurve },
  { id: 'room', label: 'Room', key: 'R', Icon: IconRoom },
  { id: 'door', label: 'Door', key: 'D', Icon: IconDoor },
  { id: 'window', label: 'Window', key: 'N', Icon: IconWindow },
  { id: 'furniture', label: 'Furniture', key: 'F', Icon: IconSofa },
  { id: 'dimension', label: 'Dimension', key: 'M', Icon: IconRuler },
  { id: 'measure', label: 'Measure', key: 'L', Icon: IconMeasure },
  { id: 'text', label: 'Text', key: 'T', Icon: IconText },
];

export interface ToolbarProps {
  onNew: () => void;
  onOpen: () => void;
  onExport: () => void;
  onPrint: () => void;
  onSettings: () => void;
  onHelp: () => void;
}

export function Toolbar(props: ToolbarProps) {
  const tool = useStoreState((s) => s.ui.tool);
  const selection = useStoreState((s) => s.ui.selection);
  const name = useStoreState((s) => s.project.name);
  const history = useHistory();

  const canUndo = history.index > 0;
  const canRedo = history.index < history.entries.length - 1;
  const hasSel = selection.length > 0;

  return (
    <header className="toolbar" role="toolbar" aria-label="Main toolbar">
      <div className="toolbar__brand">
        <IconLogo size={20} />
        <span className="sr-only">Floor Plan Creator</span>
      </div>

      <input
        className="toolbar__name"
        value={name}
        aria-label="Project name"
        onChange={(e) => store.setProjectMeta({ name: e.target.value })}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />

      <div className="divider" />

      <div className="toolbar__group">
        {TOOLS.map(({ id, label, key, Icon }) => (
          <Button
            key={id}
            active={tool === id}
            tip={`${label} · ${key}`}
            aria-label={label}
            onClick={() => store.setTool(id)}
          >
            <Icon size={16} />
          </Button>
        ))}
      </div>

      <div className="divider" />

      <div className="toolbar__group">
        <Button tip="Undo · ⌘Z" aria-label="Undo" disabled={!canUndo} onClick={() => store.undo()}>
          <IconUndo />
        </Button>
        <Button tip="Redo · ⌘⇧Z" aria-label="Redo" disabled={!canRedo} onClick={() => store.redo()}>
          <IconRedo />
        </Button>
      </div>

      <div className="toolbar__group">
        <Button
          tip="Duplicate · ⌘D"
          aria-label="Duplicate"
          disabled={!hasSel}
          onClick={() => duplicateSelection(store, selection)}
        >
          <IconCopy />
        </Button>
        <Button
          tip="Group · ⌘G"
          aria-label="Group"
          disabled={selection.length < 2}
          onClick={() => store.group(selection)}
        >
          <IconGroup />
        </Button>
        <Button
          tip="Delete · Del"
          aria-label="Delete"
          variant="danger"
          disabled={!hasSel}
          onClick={() => store.deleteEntities(selection)}
        >
          <IconTrash />
        </Button>
      </div>

      <div className="toolbar__spacer" />

      <div className="toolbar__group">
        <Button tip="New plan · ⌘N" aria-label="New plan" onClick={props.onNew}>
          <IconFile />
        </Button>
        <Button tip="Open · ⌘O" aria-label="Open" onClick={props.onOpen}>
          <IconUpload />
        </Button>
        <Button tip="Print / PDF · ⌘P" aria-label="Print" onClick={props.onPrint}>
          <IconPrint />
        </Button>
        <Button tip="Project settings" aria-label="Project settings" onClick={props.onSettings}>
          <IconSettings />
        </Button>
        <Button tip="Keyboard shortcuts" aria-label="Keyboard shortcuts" onClick={props.onHelp}>
          <IconHelp />
        </Button>
      </div>

      <Button variant="primary" onClick={props.onExport}>
        <IconDownload />
        Export
      </Button>
    </header>
  );
}
