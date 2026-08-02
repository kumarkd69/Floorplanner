import { useMemo, useState } from 'react';
import type { UIState } from '@/types';
import { store, useHistory, useStoreState } from '@/hooks/useStore';
import {
  doorSchedule,
  exportSchedulesCSV,
  roomSchedule,
  wallSchedule,
  windowSchedule,
  type ScheduleRow,
} from '@/export';
import { FurnitureLibrary } from './FurnitureLibrary';
import { RoomLibrary } from './RoomLibrary';
import { Button, IconButton, Segmented } from './ui';
import {
  IconChevronDown,
  IconChevronUp,
  IconDownload,
  IconEye,
  IconEyeOff,
  IconLayers,
  IconLock,
  IconRoom,
  IconSofa,
  IconTable,
  IconUnlock,
} from './Icons';

const TABS: Array<{ id: UIState['sidebarTab']; label: string; Icon: React.ComponentType<{ size?: number }> }> = [
  { id: 'rooms', label: 'Rooms', Icon: IconRoom },
  { id: 'library', label: 'Furniture', Icon: IconSofa },
  { id: 'layers', label: 'Layers', Icon: IconLayers },
  { id: 'schedule', label: 'Schedules', Icon: IconTable },
  { id: 'history', label: 'History', Icon: IconLayers },
];

export function Sidebar() {
  const tab = useStoreState((s) => s.ui.sidebarTab);

  return (
    <aside className="panel panel--left" aria-label="Library and layers">
      <div className="panel__tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`panel__tab ${tab === t.id ? 'panel__tab--active' : ''}`}
            onClick={() => store.setUI({ sidebarTab: t.id })}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="panel__body" role="tabpanel">
        {tab === 'rooms' && <RoomLibrary />}
        {tab === 'library' && <FurnitureLibrary />}
        {tab === 'layers' && <Layers />}
        {tab === 'schedule' && <Schedules />}
        {tab === 'history' && <History />}
      </div>
    </aside>
  );
}

/* --------------------------------------------------------------- layers */

function Layers() {
  const layers = useStoreState((s) => s.project.layers);
  const entities = useStoreState((s) => s.project.entities);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of Object.values(entities)) m.set(e.layerId, (m.get(e.layerId) ?? 0) + 1);
    return m;
  }, [entities]);

  return (
    <div className="panel__section" style={{ borderBottom: 'none' }}>
      <h3 className="panel__title">Layers · top of stack first</h3>
      {/* Reversed so the visual order matches the paint order on screen. */}
      {[...layers].reverse().map((layer, revIndex) => {
        const index = layers.length - 1 - revIndex;
        return (
          <div key={layer.id} className={`layer ${layer.visible ? '' : 'layer--hidden'}`}>
            <span className="layer__swatch" style={{ background: layer.color }} />
            <input
              className="layer__name"
              value={layer.name}
              aria-label={`Layer name: ${layer.name}`}
              onChange={(e) => store.updateLayer(layer.id, { name: e.target.value })}
              onKeyDown={(e) => e.stopPropagation()}
            />
            <span className="badge">{counts.get(layer.id) ?? 0}</span>
            <IconButton
              label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
              on={!layer.visible}
              onClick={() => store.updateLayer(layer.id, { visible: !layer.visible })}
            >
              {layer.visible ? <IconEye size={14} /> : <IconEyeOff size={14} />}
            </IconButton>
            <IconButton
              label={layer.locked ? `Unlock ${layer.name}` : `Lock ${layer.name}`}
              on={layer.locked}
              onClick={() => store.updateLayer(layer.id, { locked: !layer.locked })}
            >
              {layer.locked ? <IconLock size={14} /> : <IconUnlock size={14} />}
            </IconButton>
            <IconButton
              label={`Move ${layer.name} up`}
              disabled={index === layers.length - 1}
              onClick={() => store.moveLayer(layer.id, 1)}
            >
              <IconChevronUp size={14} />
            </IconButton>
            <IconButton
              label={`Move ${layer.name} down`}
              disabled={index === 0}
              onClick={() => store.moveLayer(layer.id, -1)}
            >
              <IconChevronDown size={14} />
            </IconButton>
          </div>
        );
      })}

      <h3 className="panel__title" style={{ marginTop: 20 }}>
        Opacity
      </h3>
      {[...layers].reverse().map((layer) => (
        <div key={layer.id} style={{ marginBottom: 8 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 11,
              color: 'var(--text-muted)',
            }}
          >
            <span>{layer.name}</span>
            <span>{Math.round(layer.opacity * 100)}%</span>
          </div>
          <input
            className="slider"
            type="range"
            min={0}
            max={100}
            value={Math.round(layer.opacity * 100)}
            aria-label={`${layer.name} opacity`}
            onChange={(e) => store.updateLayer(layer.id, { opacity: Number(e.target.value) / 100 })}
          />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ schedules */

function Schedules() {
  const project = useStoreState((s) => s.project);
  const [kind, setKind] = useState<'door' | 'window' | 'room' | 'wall'>('room');

  const rows: ScheduleRow[] = useMemo(() => {
    switch (kind) {
      case 'door':
        return doorSchedule(project);
      case 'window':
        return windowSchedule(project);
      case 'wall':
        return wallSchedule(project);
      default:
        return roomSchedule(project);
    }
  }, [project, kind]);

  return (
    <>
      <div className="panel__section">
        <Segmented
          label="Schedule type"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'room', label: 'Rooms' },
            { value: 'door', label: 'Doors' },
            { value: 'window', label: 'Windows' },
            { value: 'wall', label: 'Walls' },
          ]}
        />
      </div>
      {rows.length === 0 ? (
        <p className="panel__empty">No {kind}s yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Mark</th>
              <th>Type</th>
              <th>Size</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.mark} title={r.detail}>
                <td className="table__mark">{r.mark}</td>
                <td style={{ textTransform: 'capitalize' }}>{r.type}</td>
                <td>{r.size}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="panel__section" style={{ borderBottom: 'none' }}>
        <Button variant="ghost" className="btn--block" onClick={() => exportSchedulesCSV(project)}>
          <IconDownload size={14} />
          Export all schedules (CSV)
        </Button>
      </div>
    </>
  );
}

/* -------------------------------------------------------------- history */

function History() {
  const { entries, index } = useHistory();

  return (
    <div style={{ padding: '8px 0' }}>
      {/* Newest first — the most recent action is what you usually want. */}
      {[...entries].reverse().map((entry, revIndex) => {
        const i = entries.length - 1 - revIndex;
        return (
          <button
            key={`${entry.at}-${i}`}
            type="button"
            className={`hist ${i === index ? 'hist--current' : ''} ${i > index ? 'hist--future' : ''}`}
            onClick={() => store.gotoHistory(i)}
          >
            <span>{entry.label}</span>
            <span className="hist__time">
              {new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </button>
        );
      })}
    </div>
  );
}
