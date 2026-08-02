import type { Layer, LayerKind, Project, Unit, Wall } from '@/types';
import { uid } from '@/core/id';
import { toMM } from '@/core/units';
import { syncAutoRooms } from '@/core/rooms';
import type { Plot } from '@/types';

const LAYER_DEFS: Array<{ kind: LayerKind; name: string; color: string }> = [
  { kind: 'rooms', name: 'Rooms', color: '#94a3b8' },
  { kind: 'walls', name: 'Walls', color: '#1e293b' },
  { kind: 'furniture', name: 'Furniture', color: '#475569' },
  { kind: 'plumbing', name: 'Plumbing', color: '#0891b2' },
  { kind: 'electrical', name: 'Electrical', color: '#ca8a04' },
  { kind: 'hvac', name: 'HVAC', color: '#7c3aed' },
  { kind: 'images', name: 'Images', color: '#64748b' },
  { kind: 'dimensions', name: 'Dimensions', color: '#2563eb' },
  { kind: 'annotations', name: 'Annotations', color: '#dc2626' },
];

export function createLayers(): Layer[] {
  return LAYER_DEFS.map((d) => ({
    id: uid('layer'),
    kind: d.kind,
    name: d.name,
    visible: true,
    locked: false,
    opacity: 1,
    color: d.color,
  }));
}

export function layerIdFor(project: Project, kind: LayerKind): string {
  const layer = project.layers.find((l) => l.kind === kind);
  return layer ? layer.id : project.layers[0].id;
}

export interface NewProjectOptions {
  name: string;
  width: number;
  height: number;
  unit: Unit;
  /** Generate the enclosing outer walls automatically. */
  outerWalls: boolean;
  wallThickness?: number;
  ceilingHeight?: number;
}

/**
 * Create a project. When `outerWalls` is set we lay out the four exterior walls
 * so their **inner faces** match the requested dimensions — that is how
 * architects quote a room size, and it means the auto-detected room reports the
 * number the user typed in.
 */
export function createProject(opts: NewProjectOptions): Project {
  const layers = createLayers();
  const unit = opts.unit;
  const w = toMM(opts.width, unit);
  const h = toMM(opts.height, unit);
  const thickness = opts.wallThickness ?? (unit === 'ft' || unit === 'in' ? 203.2 : 200);
  const height = opts.ceilingHeight ?? (unit === 'ft' || unit === 'in' ? 2743.2 : 2700);

  const wallLayer = layers.find((l) => l.kind === 'walls')!.id;
  const half = thickness / 2;

  const project: Project = {
    id: uid('proj'),
    name: opts.name || 'Untitled Plan',
    unit,
    width: w,
    height: h,
    gridSize: unit === 'ft' || unit === 'in' ? 304.8 : 500,
    wallDefaults: {
      exteriorThickness: thickness,
      interiorThickness: thickness / 2,
      height,
      material: 'brick',
    },
    layers,
    entities: {},
    order: [],
    groups: {},
    titleBlock: {
      projectName: opts.name || 'Untitled Plan',
      client: '',
      drawnBy: '',
      sheet: 'A-101',
      date: new Date().toISOString().slice(0, 10),
      notes: '',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // The plot is the site everything snaps to and is kept inside.
  const plot: Plot = {
    id: uid('plot'),
    type: 'plot',
    layerId: layers.find((l) => l.kind === 'rooms')!.id,
    x: -half,
    y: -half,
    width: w + thickness,
    height: h + thickness,
    name: 'Plot',
    locked: false,
    hidden: false,
  };
  project.entities[plot.id] = plot;
  project.order.push(plot.id);

  if (opts.outerWalls && w > 0 && h > 0) {
    // Centrelines sit half a thickness outside the requested inner rectangle.
    const x0 = -half;
    const y0 = -half;
    const x1 = w + half;
    const y1 = h + half;
    const corners = [
      [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
      ],
      [
        { x: x1, y: y0 },
        { x: x1, y: y1 },
      ],
      [
        { x: x1, y: y1 },
        { x: x0, y: y1 },
      ],
      [
        { x: x0, y: y1 },
        { x: x0, y: y0 },
      ],
    ];
    for (const [a, b] of corners) {
      const wall: Wall = {
        id: uid('wall'),
        type: 'wall',
        layerId: wallLayer,
        a,
        b,
        bulge: 0,
        thickness,
        height,
        material: 'brick',
        exterior: true,
        locked: false,
        hidden: false,
      };
      project.entities[wall.id] = wall;
      project.order.push(wall.id);
    }
    return syncAutoRooms(project);
  }

  return project;
}

/** A small furnished demo so the canvas is never an empty void on first load. */
export function createSampleProject(): Project {
  return createProject({
    name: 'Sample Plan',
    width: 40,
    height: 30,
    unit: 'ft',
    outerWalls: true,
  });
}
