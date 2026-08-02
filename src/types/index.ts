/**
 * Domain model for the floor planner.
 *
 * Coordinate system: all geometry is stored in **millimetres** in a right-handed
 * plane with +x to the right and +y downwards (screen-like). Millimetres give us
 * integer-friendly precision for both metric and imperial work and avoid the
 * float drift you get from storing feet. Units only exist at the presentation
 * boundary (`core/units.ts`).
 */

export type ID = string;

export interface Vec2 {
  x: number;
  y: number;
}

/* ------------------------------------------------------------------ units */

export type Unit = 'ft' | 'in' | 'm' | 'cm';

/* ----------------------------------------------------------------- layers */

export type LayerKind =
  | 'walls'
  | 'rooms'
  | 'furniture'
  | 'dimensions'
  | 'electrical'
  | 'plumbing'
  | 'hvac'
  | 'annotations'
  | 'images';

export interface Layer {
  id: ID;
  kind: LayerKind;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0..1
  color: string;
}

/* ------------------------------------------------------------------ walls */

export type WallMaterial =
  | 'brick'
  | 'concrete'
  | 'drywall'
  | 'block'
  | 'wood'
  | 'glass';

export interface Wall {
  id: ID;
  type: 'wall';
  layerId: ID;
  a: Vec2;
  b: Vec2;
  /**
   * Arc bulge factor: perpendicular sagitta as a fraction of chord length.
   * 0 = straight. Positive bulges to the left of a→b. Curved walls are stored
   * as circular arcs so trimming/offsetting stay analytic.
   */
  bulge: number;
  thickness: number; // mm
  height: number; // mm
  material: WallMaterial;
  exterior: boolean;
  locked: boolean;
  hidden: boolean;
  groupId?: ID;
  notes?: string;
}

/* ------------------------------------------------------------------ rooms */

export type RoomType =
  | 'bedroom'
  | 'kitchen'
  | 'living'
  | 'bathroom'
  | 'dining'
  | 'balcony'
  | 'utility'
  | 'hallway'
  | 'office'
  | 'other';

export interface Room {
  id: ID;
  type: 'room';
  layerId: ID;
  /** Closed polygon in mm, wound clockwise. */
  polygon: Vec2[];
  name: string;
  roomType: RoomType;
  /** Set when the room came from automatic enclosure detection. */
  auto: boolean;
  /** User renamed it — auto-detection must not clobber the name. */
  renamed: boolean;
  floorFinish: string;
  wallFinish: string;
  ceilingHeight: number; // mm
  color: string;
  notes?: string;
  locked: boolean;
  hidden: boolean;
  groupId?: ID;
}

/* ------------------------------------------------------- doors & windows */

export type DoorKind =
  | 'single'
  | 'double'
  | 'sliding'
  | 'pocket'
  | 'folding'
  | 'french';

export interface Door {
  id: ID;
  type: 'door';
  layerId: ID;
  wallId: ID;
  /** Position along the host wall, 0..1 of its centreline length. */
  t: number;
  width: number; // mm
  height: number; // mm
  kind: DoorKind;
  /** Which side of the wall the leaf swings to. */
  swing: 'left' | 'right';
  /** Which face of the wall the swing arc falls on. */
  direction: 'in' | 'out';
  frame: string;
  material: string;
  locked: boolean;
  hidden: boolean;
  groupId?: ID;
  notes?: string;
}

export type WindowKind =
  | 'sliding'
  | 'casement'
  | 'awning'
  | 'fixed'
  | 'bay'
  | 'corner';

export interface WindowOpening {
  id: ID;
  type: 'window';
  layerId: ID;
  wallId: ID;
  t: number;
  width: number; // mm
  height: number; // mm
  sill: number; // mm above floor
  kind: WindowKind;
  glass: string;
  frame: string;
  locked: boolean;
  hidden: boolean;
  groupId?: ID;
  notes?: string;
}

/* -------------------------------------------------------------- furniture */

export type FurnitureCategory =
  | 'bedroom'
  | 'living'
  | 'kitchen'
  | 'bathroom'
  | 'dining'
  | 'office'
  | 'outdoor'
  | 'electrical'
  | 'hvac'
  | 'plumbing'
  | 'decor'
  | 'storage';

export interface Furniture {
  id: ID;
  type: 'furniture';
  layerId: ID;
  /** Key into the furniture catalog — drives the symbol drawing. */
  catalogId: string;
  /** Centre of the item's bounding box, in mm. */
  position: Vec2;
  width: number; // mm, along local x
  depth: number; // mm, along local y
  rotation: number; // radians, clockwise
  flipX: boolean;
  flipY: boolean;
  color?: string;
  locked: boolean;
  hidden: boolean;
  groupId?: ID;
  notes?: string;
}

/* ------------------------------------------------------------- dimensions */

export type DimensionKind =
  | 'linear'
  | 'horizontal'
  | 'vertical'
  | 'angular'
  | 'radial'
  | 'chain'
  | 'baseline';

export interface Dimension {
  id: ID;
  type: 'dimension';
  layerId: ID;
  kind: DimensionKind;
  /** Two points for linear kinds; 3+ for chain/baseline; 3 for angular (vertex first). */
  points: Vec2[];
  /** Perpendicular offset of the dimension line from the measured points, in mm. */
  offset: number;
  label?: string;
  locked: boolean;
  hidden: boolean;
  groupId?: ID;
}

/* ------------------------------------------------------------ annotations */

export interface TextNote {
  id: ID;
  type: 'text';
  layerId: ID;
  position: Vec2;
  text: string;
  size: number; // mm cap height
  rotation: number;
  locked: boolean;
  hidden: boolean;
  groupId?: ID;
}

/* -------------------------------------------------------------- entities */

export type Entity =
  | Wall
  | Room
  | Door
  | WindowOpening
  | Furniture
  | Dimension
  | TextNote;

export type EntityType = Entity['type'];

export interface Group {
  id: ID;
  name: string;
  memberIds: ID[];
}

/* --------------------------------------------------------------- project */

export interface TitleBlock {
  projectName: string;
  client: string;
  drawnBy: string;
  sheet: string;
  date: string;
  notes: string;
}

export interface Project {
  id: ID;
  name: string;
  unit: Unit;
  /** Nominal site extents in mm, used for "fit to plan" and the minimap. */
  width: number;
  height: number;
  gridSize: number; // mm
  wallDefaults: {
    exteriorThickness: number;
    interiorThickness: number;
    height: number;
    material: WallMaterial;
  };
  layers: Layer[];
  entities: Record<ID, Entity>;
  /** Paint order, bottom first. Groups are flattened; layers sort above this. */
  order: ID[];
  groups: Record<ID, Group>;
  titleBlock: TitleBlock;
  createdAt: string;
  updatedAt: string;
}

/* -------------------------------------------------------------- viewport */

export interface Viewport {
  /** World mm at the canvas top-left. */
  x: number;
  y: number;
  /** CSS pixels per mm. */
  scale: number;
}

/* ------------------------------------------------------------------ tools */

export type ToolId =
  | 'select'
  | 'pan'
  | 'wall'
  | 'wall-curved'
  | 'room'
  | 'door'
  | 'window'
  | 'furniture'
  | 'dimension'
  | 'text'
  | 'measure';

/* ------------------------------------------------------------------ snap */

export type SnapKind =
  | 'grid'
  | 'endpoint'
  | 'midpoint'
  | 'corner'
  | 'edge'
  | 'center'
  | 'intersection'
  | 'furniture'
  | 'angle'
  | 'align-x'
  | 'align-y';

export interface SnapSettings {
  enabled: boolean;
  grid: boolean;
  endpoint: boolean;
  midpoint: boolean;
  edge: boolean;
  center: boolean;
  furniture: boolean;
  angle: boolean;
  guides: boolean;
  /** Snap radius in screen pixels — constant on screen regardless of zoom. */
  radius: number;
  /** Angle increment in degrees for angle snapping. */
  angleStep: number;
}

export interface SnapResult {
  point: Vec2;
  kinds: SnapKind[];
  /** Guide lines to render, in world space. */
  guides: Array<{ a: Vec2; b: Vec2; kind: SnapKind }>;
  /** Entities the snap latched onto, for highlighting. */
  refIds: ID[];
}

/* ------------------------------------------------------------------- ui */

export type CanvasTheme = 'white' | 'blueprint' | 'dark';

export interface UIState {
  tool: ToolId;
  selection: ID[];
  hoverId: ID | null;
  theme: CanvasTheme;
  showGrid: boolean;
  showRulers: boolean;
  showMinimap: boolean;
  showDimensions: boolean;
  showRoomLabels: boolean;
  highContrast: boolean;
  largeCursor: boolean;
  snap: SnapSettings;
  /** Catalog id armed for the furniture tool. */
  activeCatalogId: string | null;
  sidebarTab: 'library' | 'layers' | 'schedule' | 'history';
  sidebarOpen: boolean;
  propertiesOpen: boolean;
}

/* -------------------------------------------------------------- history */

export interface HistoryEntry {
  label: string;
  project: Project;
  at: number;
}
