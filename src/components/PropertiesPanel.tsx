import { useMemo } from 'react';
import type {
  Door,
  Dimension,
  Entity,
  Furniture,
  Room,
  TextNote,
  Wall,
  WindowOpening,
} from '@/types';
import { store, useStoreState } from '@/hooks/useStore';
import { formatArea, formatLength } from '@/core/units';
import { roomMetrics, wallLength, wallPointAt } from '@/core/entities';
import { roomColor } from '@/core/rooms';
import { mergeWalls, offsetWall, splitWall } from '@/core/wallOps';
import { MATERIAL_LABEL } from '@/render/theme';
import {
  alignSelection,
  distributeSelection,
  duplicateSelection,
  mirrorSelection,
  rotateSelection,
  setHidden,
  setLocked,
} from '@/state/operations';
import { Button, Field, IconButton, LengthInput, NumberInput, Segmented, Select, Switch, TextInput } from './ui';
import {
  IconAlignBottom,
  IconAlignCenterH,
  IconAlignCenterV,
  IconAlignLeft,
  IconAlignRight,
  IconAlignTop,
  IconBack,
  IconCopy,
  IconDistH,
  IconDistV,
  IconEye,
  IconEyeOff,
  IconFront,
  IconLock,
  IconMerge,
  IconMirrorH,
  IconMirrorV,
  IconOffset,
  IconRotate,
  IconSplit,
  IconTrash,
  IconUnlock,
} from './Icons';

export function PropertiesPanel() {
  const project = useStoreState((s) => s.project);
  const selection = useStoreState((s) => s.ui.selection);

  const entities = useMemo(
    () => selection.map((id) => project.entities[id]).filter(Boolean) as Entity[],
    [selection, project.entities],
  );

  return (
    <aside className="panel panel--right" aria-label="Properties">
      <div className="panel__section">
        <h3 className="panel__title">
          {entities.length === 0
            ? 'Plan'
            : entities.length === 1
              ? labelFor(entities[0])
              : `${entities.length} objects selected`}
        </h3>
        {entities.length > 0 && <CommonActions entities={entities} />}
      </div>

      <div className="panel__body">
        {entities.length === 0 && <PlanInspector />}
        {entities.length === 1 && <SingleInspector entity={entities[0]} />}
        {entities.length > 1 && <MultiInspector count={entities.length} />}
      </div>
    </aside>
  );
}

function labelFor(e: Entity): string {
  switch (e.type) {
    case 'wall':
      return e.exterior ? 'Exterior wall' : 'Interior wall';
    case 'room':
      return e.name;
    case 'door':
      return 'Door';
    case 'window':
      return 'Window';
    case 'furniture':
      return 'Furniture';
    case 'dimension':
      return 'Dimension';
    case 'text':
      return 'Annotation';
  }
}

/* --------------------------------------------------------- shared actions */

function CommonActions({ entities }: { entities: Entity[] }) {
  const ids = entities.map((e) => e.id);
  const allLocked = entities.every((e) => e.locked);
  const allHidden = entities.every((e) => e.hidden);

  return (
    <div className="hstack" style={{ flexWrap: 'wrap', gap: 2 }}>
      <IconButton label="Duplicate" onClick={() => duplicateSelection(store, ids)}>
        <IconCopy size={14} />
      </IconButton>
      <IconButton label="Rotate 90°" onClick={() => rotateSelection(store, ids, Math.PI / 2)}>
        <IconRotate size={14} />
      </IconButton>
      <IconButton label="Mirror horizontally" onClick={() => mirrorSelection(store, ids, 'x')}>
        <IconMirrorH size={14} />
      </IconButton>
      <IconButton label="Mirror vertically" onClick={() => mirrorSelection(store, ids, 'y')}>
        <IconMirrorV size={14} />
      </IconButton>
      <IconButton label="Bring to front" onClick={() => store.reorder(ids, 'front')}>
        <IconFront size={14} />
      </IconButton>
      <IconButton label="Send to back" onClick={() => store.reorder(ids, 'back')}>
        <IconBack size={14} />
      </IconButton>
      <IconButton
        label={allLocked ? 'Unlock' : 'Lock'}
        on={allLocked}
        onClick={() => setLocked(store, ids, !allLocked)}
      >
        {allLocked ? <IconLock size={14} /> : <IconUnlock size={14} />}
      </IconButton>
      <IconButton
        label={allHidden ? 'Show' : 'Hide'}
        on={allHidden}
        onClick={() => setHidden(store, ids, !allHidden)}
      >
        {allHidden ? <IconEyeOff size={14} /> : <IconEye size={14} />}
      </IconButton>
      <IconButton label="Delete" onClick={() => store.deleteEntities(ids)}>
        <IconTrash size={14} />
      </IconButton>
    </div>
  );
}

/* ---------------------------------------------------------- plan defaults */

function PlanInspector() {
  const project = useStoreState((s) => s.project);
  const ui = useStoreState((s) => s.ui);
  const rooms = Object.values(project.entities).filter((e): e is Room => e.type === 'room');
  const totalArea = rooms.reduce((s, r) => s + roomMetrics(r).area, 0);

  return (
    <>
      <div className="panel__section">
        <h3 className="panel__title">Plan summary</h3>
        <Stat label="Rooms" value={String(rooms.length)} />
        <Stat label="Total area" value={formatArea(totalArea, project.unit)} />
        <Stat
          label="Objects"
          value={String(project.order.length)}
        />
      </div>

      <div className="panel__section">
        <h3 className="panel__title">Wall defaults</h3>
        <Field label="Exterior">
          <LengthInput
            valueMM={project.wallDefaults.exteriorThickness}
            unit={project.unit}
            min={25}
            onCommit={(mm) =>
              store.setProjectMeta({
                wallDefaults: { ...project.wallDefaults, exteriorThickness: mm },
              })
            }
          />
        </Field>
        <Field label="Interior">
          <LengthInput
            valueMM={project.wallDefaults.interiorThickness}
            unit={project.unit}
            min={25}
            onCommit={(mm) =>
              store.setProjectMeta({
                wallDefaults: { ...project.wallDefaults, interiorThickness: mm },
              })
            }
          />
        </Field>
        <Field label="Height">
          <LengthInput
            valueMM={project.wallDefaults.height}
            unit={project.unit}
            min={100}
            onCommit={(mm) =>
              store.setProjectMeta({ wallDefaults: { ...project.wallDefaults, height: mm } })
            }
          />
        </Field>
        <Field label="Material">
          <Select
            value={project.wallDefaults.material}
            onChange={(material) =>
              store.setProjectMeta({ wallDefaults: { ...project.wallDefaults, material } })
            }
            options={Object.entries(MATERIAL_LABEL).map(([value, label]) => ({
              value: value as Wall['material'],
              label,
            }))}
          />
        </Field>
        <Field label="Grid">
          <LengthInput
            valueMM={project.gridSize}
            unit={project.unit}
            min={10}
            onCommit={(mm) => store.setProjectMeta({ gridSize: mm })}
          />
        </Field>
      </div>

      <div className="panel__section">
        <h3 className="panel__title">Snapping</h3>
        <Switch
          label="Snapping enabled"
          checked={ui.snap.enabled}
          onChange={(enabled) => store.setUI({ snap: { ...ui.snap, enabled } })}
        />
        {(
          [
            ['grid', 'Grid'],
            ['endpoint', 'Endpoints & corners'],
            ['midpoint', 'Midpoints'],
            ['edge', 'Wall & room edges'],
            ['center', 'Centers'],
            ['furniture', 'Furniture'],
            ['angle', 'Angles'],
            ['guides', 'Alignment guides'],
          ] as const
        ).map(([key, label]) => (
          <Switch
            key={key}
            label={label}
            checked={ui.snap[key]}
            onChange={(v) => store.setUI({ snap: { ...ui.snap, [key]: v } })}
          />
        ))}
        <Field label="Radius">
          <NumberInput
            value={ui.snap.radius}
            min={2}
            max={40}
            suffix="px"
            onCommit={(radius) => store.setUI({ snap: { ...ui.snap, radius } })}
          />
        </Field>
        <Field label="Angle step">
          <NumberInput
            value={ui.snap.angleStep}
            min={1}
            max={90}
            suffix="°"
            onCommit={(angleStep) => store.setUI({ snap: { ...ui.snap, angleStep } })}
          />
        </Field>
      </div>

      <div className="panel__section">
        <h3 className="panel__title">Accessibility</h3>
        <Switch
          label="High contrast"
          checked={ui.highContrast}
          onChange={(highContrast) => store.setUI({ highContrast })}
        />
        <Switch
          label="Large cursor"
          checked={ui.largeCursor}
          onChange={(largeCursor) => store.setUI({ largeCursor })}
        />
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '3px 0',
        fontSize: 12,
      }}
    >
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</strong>
    </div>
  );
}

/* ------------------------------------------------------------- multi-select */

function MultiInspector({ count }: { count: number }) {
  const selection = useStoreState((s) => s.ui.selection);
  const groups = useStoreState((s) => s.project.groups);
  const entities = useStoreState((s) => s.project.entities);
  const grouped = selection.some((id) => entities[id]?.groupId && groups[entities[id]!.groupId!]);

  return (
    <>
      <div className="panel__section">
        <h3 className="panel__title">Align</h3>
        <div className="grid3" style={{ marginBottom: 8 }}>
          <Button variant="ghost" aria-label="Align left" onClick={() => alignSelection(store, selection, 'left')}>
            <IconAlignLeft size={15} />
          </Button>
          <Button variant="ghost" aria-label="Align center" onClick={() => alignSelection(store, selection, 'center-h')}>
            <IconAlignCenterH size={15} />
          </Button>
          <Button variant="ghost" aria-label="Align right" onClick={() => alignSelection(store, selection, 'right')}>
            <IconAlignRight size={15} />
          </Button>
          <Button variant="ghost" aria-label="Align top" onClick={() => alignSelection(store, selection, 'top')}>
            <IconAlignTop size={15} />
          </Button>
          <Button variant="ghost" aria-label="Align middle" onClick={() => alignSelection(store, selection, 'center-v')}>
            <IconAlignCenterV size={15} />
          </Button>
          <Button variant="ghost" aria-label="Align bottom" onClick={() => alignSelection(store, selection, 'bottom')}>
            <IconAlignBottom size={15} />
          </Button>
        </div>
        <h3 className="panel__title">Distribute</h3>
        <div className="grid2">
          <Button
            variant="ghost"
            disabled={count < 3}
            aria-label="Distribute horizontally"
            onClick={() => distributeSelection(store, selection, 'h')}
          >
            <IconDistH size={15} />
          </Button>
          <Button
            variant="ghost"
            disabled={count < 3}
            aria-label="Distribute vertically"
            onClick={() => distributeSelection(store, selection, 'v')}
          >
            <IconDistV size={15} />
          </Button>
        </div>
      </div>

      <div className="panel__section">
        <h3 className="panel__title">Grouping</h3>
        <div className="grid2">
          <Button variant="ghost" onClick={() => store.group(selection)}>
            Group
          </Button>
          <Button variant="ghost" disabled={!grouped} onClick={() => store.ungroup(selection)}>
            Ungroup
          </Button>
        </div>
      </div>

      <div className="panel__section">
        <p className="note">
          Tip: hold <kbd className="kbd">⇧</kbd> to add to the selection, or drag a marquee.
          Right-to-left drags select everything they touch.
        </p>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- single */

function SingleInspector({ entity }: { entity: Entity }) {
  switch (entity.type) {
    case 'wall':
      return <WallInspector wall={entity} />;
    case 'room':
      return <RoomInspector room={entity} />;
    case 'door':
      return <DoorInspector door={entity} />;
    case 'window':
      return <WindowInspector win={entity} />;
    case 'furniture':
      return <FurnitureInspector item={entity} />;
    case 'dimension':
      return <DimensionInspector dim={entity} />;
    case 'text':
      return <TextInspector note={entity} />;
  }
}

function WallInspector({ wall }: { wall: Wall }) {
  const project = useStoreState((s) => s.project);
  const neighbours = useMemo(
    () =>
      Object.values(project.entities).filter(
        (e): e is Wall =>
          e.type === 'wall' &&
          e.id !== wall.id &&
          Math.abs(e.bulge) < 1e-4 &&
          [e.a, e.b].some((p) => [wall.a, wall.b].some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 20)),
      ),
    [project.entities, wall],
  );

  const set = (patch: Partial<Wall>) =>
    store.updateEntity<Wall>('Edit wall', wall.id, patch, { reflowRooms: true, weld: [wall.id] });

  return (
    <>
      <div className="panel__section">
        <Field label="Length">
          <LengthInput
            valueMM={wallLength(wall)}
            unit={project.unit}
            min={10}
            onCommit={(mm) => {
              // Resize by moving `b` along the existing direction, so joints at
              // `a` stay put.
              const dx = wall.b.x - wall.a.x;
              const dy = wall.b.y - wall.a.y;
              const cur = Math.hypot(dx, dy) || 1;
              set({ b: { x: wall.a.x + (dx / cur) * mm, y: wall.a.y + (dy / cur) * mm } });
            }}
          />
        </Field>
        <Field label="Thickness">
          <LengthInput
            valueMM={wall.thickness}
            unit={project.unit}
            min={25}
            onCommit={(thickness) => set({ thickness })}
          />
        </Field>
        <Field label="Height">
          <LengthInput
            valueMM={wall.height}
            unit={project.unit}
            min={100}
            onCommit={(height) => set({ height })}
          />
        </Field>
        <Field label="Material">
          <Select
            value={wall.material}
            onChange={(material) => set({ material })}
            options={Object.entries(MATERIAL_LABEL).map(([value, label]) => ({
              value: value as Wall['material'],
              label,
            }))}
          />
        </Field>
        <Field label="Curvature">
          <input
            className="slider"
            type="range"
            min={-80}
            max={80}
            value={Math.round(wall.bulge * 100)}
            aria-label="Wall curvature"
            onChange={(e) => set({ bulge: Number(e.target.value) / 100 })}
          />
        </Field>
        <Switch label="Exterior wall" checked={wall.exterior} onChange={(exterior) => set({ exterior })} />
      </div>

      <div className="panel__section">
        <h3 className="panel__title">Operations</h3>
        <div className="vstack">
          <Button
            variant="ghost"
            onClick={() =>
              store.commit('Split wall', (p) => splitWall(p, wall.id, wallPointAt(wall, 0.5)), {
                reflowRooms: true,
              })
            }
          >
            <IconSplit size={14} />
            Split at midpoint
          </Button>
          <Button
            variant="ghost"
            disabled={neighbours.length === 0}
            onClick={() =>
              store.commit('Merge walls', (p) => mergeWalls(p, wall.id, neighbours[0].id), {
                reflowRooms: true,
              })
            }
          >
            <IconMerge size={14} />
            Merge with neighbour
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              store.commit('Offset wall', (p) => offsetWall(p, wall.id, wall.thickness * 2), {
                reflowRooms: true,
              })
            }
          >
            <IconOffset size={14} />
            Offset copy
          </Button>
        </div>
        <p className="note" style={{ marginTop: 8 }}>
          Double-click a wall on the canvas to split it exactly where you click. Drag its round
          endpoints to extend or trim; connected walls follow.
        </p>
      </div>
    </>
  );
}

function RoomInspector({ room }: { room: Room }) {
  const project = useStoreState((s) => s.project);
  const { area, perimeter } = roomMetrics(room);
  const set = (patch: Partial<Room>) => store.updateEntity<Room>('Edit room', room.id, patch);

  return (
    <>
      <div className="panel__section">
        <Field label="Name">
          <TextInput value={room.name} onCommit={(name) => set({ name, renamed: true })} />
        </Field>
        <Field label="Type">
          <Select
            value={room.roomType}
            onChange={(roomType) => set({ roomType, color: roomColor(roomType), renamed: true })}
            options={[
              { value: 'bedroom', label: 'Bedroom' },
              { value: 'kitchen', label: 'Kitchen' },
              { value: 'living', label: 'Living' },
              { value: 'bathroom', label: 'Bathroom' },
              { value: 'dining', label: 'Dining' },
              { value: 'balcony', label: 'Balcony' },
              { value: 'utility', label: 'Utility' },
              { value: 'hallway', label: 'Hallway' },
              { value: 'office', label: 'Office' },
              { value: 'other', label: 'Other' },
            ]}
          />
        </Field>
        <Field label="Colour">
          <input
            type="color"
            className="input"
            style={{ padding: 2, height: 28 }}
            value={room.color}
            aria-label="Room colour"
            onChange={(e) => set({ color: e.target.value })}
          />
        </Field>
        <Stat label="Area" value={formatArea(area, project.unit)} />
        <Stat label="Perimeter" value={formatLength(perimeter, project.unit)} />
        <Stat label="Source" value={room.auto ? 'Auto-detected' : 'Manual'} />
      </div>

      <div className="panel__section">
        <h3 className="panel__title">Finishes</h3>
        <Field label="Floor">
          <TextInput value={room.floorFinish} onCommit={(floorFinish) => set({ floorFinish })} />
        </Field>
        <Field label="Walls">
          <TextInput value={room.wallFinish} onCommit={(wallFinish) => set({ wallFinish })} />
        </Field>
        <Field label="Ceiling">
          <LengthInput
            valueMM={room.ceilingHeight}
            unit={project.unit}
            min={100}
            onCommit={(ceilingHeight) => set({ ceilingHeight })}
          />
        </Field>
        <Field label="Notes" stack>
          <TextInput value={room.notes ?? ''} onCommit={(notes) => set({ notes })} />
        </Field>
      </div>
    </>
  );
}

function DoorInspector({ door }: { door: Door }) {
  const project = useStoreState((s) => s.project);
  const wall = project.entities[door.wallId];
  const maxWidth = wall && wall.type === 'wall' ? wallLength(wall) - 20 : 4000;
  const set = (patch: Partial<Door>) => store.updateEntity<Door>('Edit door', door.id, patch);

  return (
    <>
      <div className="panel__section">
        <Field label="Type">
          <Select
            value={door.kind}
            onChange={(kind) => set({ kind })}
            options={[
              { value: 'single', label: 'Single swing' },
              { value: 'double', label: 'Double swing' },
              { value: 'sliding', label: 'Sliding' },
              { value: 'pocket', label: 'Pocket' },
              { value: 'folding', label: 'Bi-fold' },
              { value: 'french', label: 'French' },
            ]}
          />
        </Field>
        <Field label="Width">
          <LengthInput
            valueMM={door.width}
            unit={project.unit}
            min={300}
            onCommit={(width) => set({ width: Math.min(width, maxWidth) })}
          />
        </Field>
        <Field label="Height">
          <LengthInput valueMM={door.height} unit={project.unit} min={300} onCommit={(height) => set({ height })} />
        </Field>
        <Field label="Swing">
          <Segmented
            label="Swing side"
            value={door.swing}
            onChange={(swing) => set({ swing })}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'right', label: 'Right' },
            ]}
          />
        </Field>
        <Field label="Opens">
          <Segmented
            label="Swing direction"
            value={door.direction}
            onChange={(direction) => set({ direction })}
            options={[
              { value: 'in', label: 'Inward' },
              { value: 'out', label: 'Outward' },
            ]}
          />
        </Field>
        <Field label="Position">
          <input
            className="slider"
            type="range"
            min={0}
            max={100}
            value={Math.round(door.t * 100)}
            aria-label="Position along the wall"
            onChange={(e) => set({ t: Number(e.target.value) / 100 })}
          />
        </Field>
      </div>
      <div className="panel__section">
        <h3 className="panel__title">Specification</h3>
        <Field label="Material">
          <TextInput value={door.material} onCommit={(material) => set({ material })} />
        </Field>
        <Field label="Frame">
          <TextInput value={door.frame} onCommit={(frame) => set({ frame })} />
        </Field>
        <Field label="Notes" stack>
          <TextInput value={door.notes ?? ''} onCommit={(notes) => set({ notes })} />
        </Field>
      </div>
    </>
  );
}

function WindowInspector({ win }: { win: WindowOpening }) {
  const project = useStoreState((s) => s.project);
  const wall = project.entities[win.wallId];
  const maxWidth = wall && wall.type === 'wall' ? wallLength(wall) - 20 : 6000;
  const set = (patch: Partial<WindowOpening>) =>
    store.updateEntity<WindowOpening>('Edit window', win.id, patch);

  return (
    <>
      <div className="panel__section">
        <Field label="Type">
          <Select
            value={win.kind}
            onChange={(kind) => set({ kind })}
            options={[
              { value: 'sliding', label: 'Sliding' },
              { value: 'casement', label: 'Casement' },
              { value: 'awning', label: 'Awning' },
              { value: 'fixed', label: 'Fixed' },
              { value: 'bay', label: 'Bay' },
              { value: 'corner', label: 'Corner' },
            ]}
          />
        </Field>
        <Field label="Width">
          <LengthInput
            valueMM={win.width}
            unit={project.unit}
            min={200}
            onCommit={(width) => set({ width: Math.min(width, maxWidth) })}
          />
        </Field>
        <Field label="Height">
          <LengthInput valueMM={win.height} unit={project.unit} min={200} onCommit={(height) => set({ height })} />
        </Field>
        <Field label="Sill">
          <LengthInput valueMM={win.sill} unit={project.unit} min={0} onCommit={(sill) => set({ sill })} />
        </Field>
        <Field label="Position">
          <input
            className="slider"
            type="range"
            min={0}
            max={100}
            value={Math.round(win.t * 100)}
            aria-label="Position along the wall"
            onChange={(e) => set({ t: Number(e.target.value) / 100 })}
          />
        </Field>
      </div>
      <div className="panel__section">
        <h3 className="panel__title">Specification</h3>
        <Field label="Glass">
          <TextInput value={win.glass} onCommit={(glass) => set({ glass })} />
        </Field>
        <Field label="Frame">
          <TextInput value={win.frame} onCommit={(frame) => set({ frame })} />
        </Field>
        <Field label="Notes" stack>
          <TextInput value={win.notes ?? ''} onCommit={(notes) => set({ notes })} />
        </Field>
      </div>
    </>
  );
}

function FurnitureInspector({ item }: { item: Furniture }) {
  const project = useStoreState((s) => s.project);
  const set = (patch: Partial<Furniture>) =>
    store.updateEntity<Furniture>('Edit furniture', item.id, patch);

  return (
    <>
      <div className="panel__section">
        <Field label="Width">
          <LengthInput valueMM={item.width} unit={project.unit} min={50} onCommit={(width) => set({ width })} />
        </Field>
        <Field label="Depth">
          <LengthInput valueMM={item.depth} unit={project.unit} min={50} onCommit={(depth) => set({ depth })} />
        </Field>
        <Field label="Rotation">
          <NumberInput
            value={Math.round(((item.rotation * 180) / Math.PI) % 360)}
            step={15}
            suffix="°"
            onCommit={(deg) => set({ rotation: (deg * Math.PI) / 180 })}
          />
        </Field>
        <Field label="X">
          <LengthInput
            valueMM={item.position.x}
            unit={project.unit}
            min={-Infinity}
            onCommit={(x) => set({ position: { ...item.position, x } })}
          />
        </Field>
        <Field label="Y">
          <LengthInput
            valueMM={item.position.y}
            unit={project.unit}
            min={-Infinity}
            onCommit={(y) => set({ position: { ...item.position, y } })}
          />
        </Field>
        <Switch label="Flip horizontally" checked={item.flipX} onChange={(flipX) => set({ flipX })} />
        <Switch label="Flip vertically" checked={item.flipY} onChange={(flipY) => set({ flipY })} />
        <Field label="Colour">
          <input
            type="color"
            className="input"
            style={{ padding: 2, height: 28 }}
            value={item.color ?? '#f8fafc'}
            aria-label="Furniture colour"
            onChange={(e) => set({ color: e.target.value })}
          />
        </Field>
        <Field label="Notes" stack>
          <TextInput value={item.notes ?? ''} onCommit={(notes) => set({ notes })} />
        </Field>
      </div>
    </>
  );
}

function DimensionInspector({ dim }: { dim: Dimension }) {
  const project = useStoreState((s) => s.project);
  const set = (patch: Partial<Dimension>) =>
    store.updateEntity<Dimension>('Edit dimension', dim.id, patch);

  return (
    <div className="panel__section">
      <Field label="Style">
        <Select
          value={dim.kind}
          onChange={(kind) => set({ kind })}
          options={[
            { value: 'linear', label: 'Aligned' },
            { value: 'horizontal', label: 'Horizontal' },
            { value: 'vertical', label: 'Vertical' },
            { value: 'chain', label: 'Chain' },
            { value: 'baseline', label: 'Baseline' },
            { value: 'angular', label: 'Angular' },
            { value: 'radial', label: 'Radial' },
          ]}
        />
      </Field>
      <Field label="Offset">
        <LengthInput
          valueMM={dim.offset}
          unit={project.unit}
          min={-100000}
          onCommit={(offset) => set({ offset })}
        />
      </Field>
      <Field label="Override" stack>
        <TextInput
          value={dim.label ?? ''}
          placeholder="Automatic"
          onCommit={(label) => set({ label: label || undefined })}
        />
      </Field>
      <p className="note">
        Chain and baseline styles use every point you clicked. Angular needs three points, with the
        vertex first.
      </p>
    </div>
  );
}

function TextInspector({ note }: { note: TextNote }) {
  const project = useStoreState((s) => s.project);
  const set = (patch: Partial<TextNote>) => store.updateEntity<TextNote>('Edit note', note.id, patch);

  return (
    <div className="panel__section">
      <Field label="Text" stack>
        <TextInput value={note.text} onCommit={(text) => set({ text })} />
      </Field>
      <Field label="Size">
        <LengthInput valueMM={note.size} unit={project.unit} min={20} onCommit={(size) => set({ size })} />
      </Field>
      <Field label="Rotation">
        <NumberInput
          value={Math.round((note.rotation * 180) / Math.PI)}
          step={15}
          suffix="°"
          onCommit={(deg) => set({ rotation: (deg * Math.PI) / 180 })}
        />
      </Field>
    </div>
  );
}
