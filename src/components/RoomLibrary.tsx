import { useMemo, useState } from 'react';
import { PRESET_GROUPS, ROOM_PRESETS, searchPresets, type RoomPreset } from '@/data/roomPresets';
import { roomColor } from '@/core/rooms';
import { store, useStoreState } from '@/hooks/useStore';
import { IconRoom, IconSearch } from './Icons';

/**
 * Ready-made rooms.
 *
 * Clicking a preset arms it; the next canvas click drops the room at its
 * standard size, already enclosed by walls and snapped into the plot. It is the
 * fastest path from blank sheet to a plan you can then tune numerically.
 */
export function RoomLibrary() {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<RoomPreset['group'] | 'all'>('all');
  const activeId = useStoreState((s) => s.ui.activePresetId);
  const tool = useStoreState((s) => s.ui.tool);

  const items = useMemo(() => {
    const base = query ? searchPresets(query) : ROOM_PRESETS;
    return group === 'all' ? base : base.filter((p) => p.group === group);
  }, [query, group]);

  return (
    <>
      <div className="panel__section" style={{ paddingBottom: 8 }}>
        <button
          type="button"
          className={`bigtool ${tool === 'room' ? 'bigtool--on' : ''}`}
          onClick={() => store.setTool(tool === 'room' ? 'select' : 'room')}
        >
          <IconRoom size={18} />
          <span>
            <strong>Draw a room</strong>
            <em>Drag a rectangle — walls and dimensions are added for you</em>
          </span>
        </button>
      </div>

      <div className="search">
        <IconSearch size={14} />
        <input
          className="input"
          placeholder="Search rooms…"
          value={query}
          aria-label="Search room presets"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </div>

      <div className="chips" role="group" aria-label="Room groups">
        <button
          type="button"
          className={`chip ${group === 'all' ? 'chip--active' : ''}`}
          onClick={() => setGroup('all')}
        >
          All
        </button>
        {PRESET_GROUPS.map((g) => (
          <button
            key={g}
            type="button"
            className={`chip ${group === g ? 'chip--active' : ''}`}
            onClick={() => setGroup(g)}
          >
            {g}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="panel__empty">Nothing matches “{query}”.</p>
      ) : (
        <div className="roomgrid">
          {items.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`roomcard ${activeId === p.id ? 'roomcard--on' : ''}`}
              aria-label={`${p.name}, ${p.wFt} by ${p.hFt} feet. Click then click the plan to place.`}
              onClick={() =>
                store.setUI({
                  tool: 'furniture',
                  activePresetId: activeId === p.id ? null : p.id,
                  activeCatalogId: null,
                })
              }
            >
              <span className="roomcard__swatch" style={{ background: roomColor(p.roomType) }}>
                {/* Proportional thumbnail so the shape reads at a glance. */}
                <span
                  className="roomcard__shape"
                  style={{
                    aspectRatio: `${p.wFt} / ${p.hFt}`,
                    maxWidth: '100%',
                    maxHeight: '100%',
                  }}
                />
              </span>
              <span className="roomcard__name">{p.name}</span>
              <span className="roomcard__size">
                {p.wFt}′ × {p.hFt}′ · {Math.round(p.wFt * p.hFt)} ft²
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
