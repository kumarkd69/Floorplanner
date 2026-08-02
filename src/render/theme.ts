import type { CanvasTheme, WallMaterial } from '@/types';

export interface RenderTheme {
  background: string;
  gridMinor: string;
  gridMajor: string;
  axis: string;
  wallFill: string;
  wallStroke: string;
  wallExteriorFill: string;
  roomFillAlpha: number;
  roomStroke: string;
  roomLabel: string;
  roomSubLabel: string;
  openingStroke: string;
  openingFill: string;
  furnitureFill: string;
  furnitureStroke: string;
  dimension: string;
  selection: string;
  selectionFill: string;
  hover: string;
  guide: string;
  snapMarker: string;
  measureText: string;
  measureBg: string;
  ruler: string;
  rulerText: string;
  rulerBg: string;
  text: string;
}

const WHITE: RenderTheme = {
  background: '#ffffff',
  gridMinor: '#eef2f7',
  gridMajor: '#dfe6ef',
  axis: '#cbd5e1',
  wallFill: '#334155',
  wallStroke: '#0f172a',
  wallExteriorFill: '#1e293b',
  roomFillAlpha: 0.55,
  roomStroke: '#cbd5e1',
  roomLabel: '#0f172a',
  roomSubLabel: '#64748b',
  openingStroke: '#0f172a',
  openingFill: '#ffffff',
  furnitureFill: '#f8fafc',
  furnitureStroke: '#475569',
  dimension: '#2563eb',
  selection: '#2563eb',
  selectionFill: 'rgba(37, 99, 235, 0.10)',
  hover: '#60a5fa',
  guide: '#ec4899',
  snapMarker: '#f43f5e',
  measureText: '#ffffff',
  measureBg: 'rgba(15, 23, 42, 0.92)',
  ruler: '#cbd5e1',
  rulerText: '#64748b',
  rulerBg: '#f8fafc',
  text: '#0f172a',
};

const BLUEPRINT: RenderTheme = {
  ...WHITE,
  background: '#0b3d91',
  gridMinor: 'rgba(255,255,255,0.08)',
  gridMajor: 'rgba(255,255,255,0.16)',
  axis: 'rgba(255,255,255,0.35)',
  wallFill: '#e8f0ff',
  wallStroke: '#ffffff',
  wallExteriorFill: '#ffffff',
  roomFillAlpha: 0.12,
  roomStroke: 'rgba(255,255,255,0.35)',
  roomLabel: '#ffffff',
  roomSubLabel: 'rgba(255,255,255,0.75)',
  openingStroke: '#ffffff',
  openingFill: '#0b3d91',
  furnitureFill: 'rgba(255,255,255,0.06)',
  furnitureStroke: '#cfe0ff',
  dimension: '#7dd3fc',
  selection: '#38bdf8',
  selectionFill: 'rgba(56, 189, 248, 0.14)',
  hover: '#bae6fd',
  guide: '#f9a8d4',
  snapMarker: '#fda4af',
  ruler: 'rgba(255,255,255,0.3)',
  rulerText: '#dbeafe',
  rulerBg: '#082f6f',
  text: '#ffffff',
};

const DARK: RenderTheme = {
  ...WHITE,
  background: '#0f172a',
  gridMinor: '#182238',
  gridMajor: '#1f2c46',
  axis: '#334155',
  wallFill: '#cbd5e1',
  wallStroke: '#f8fafc',
  wallExteriorFill: '#e2e8f0',
  roomFillAlpha: 0.18,
  roomStroke: '#334155',
  roomLabel: '#f1f5f9',
  roomSubLabel: '#94a3b8',
  openingStroke: '#e2e8f0',
  openingFill: '#0f172a',
  furnitureFill: '#1e293b',
  furnitureStroke: '#94a3b8',
  dimension: '#60a5fa',
  selection: '#3b82f6',
  selectionFill: 'rgba(59, 130, 246, 0.16)',
  hover: '#93c5fd',
  guide: '#f472b6',
  snapMarker: '#fb7185',
  ruler: '#334155',
  rulerText: '#94a3b8',
  rulerBg: '#111c33',
  text: '#f1f5f9',
};

/** Maximum-contrast variant for the accessibility toggle. */
const HIGH_CONTRAST: RenderTheme = {
  ...WHITE,
  background: '#ffffff',
  gridMinor: '#d4d4d4',
  gridMajor: '#a3a3a3',
  wallFill: '#000000',
  wallStroke: '#000000',
  wallExteriorFill: '#000000',
  roomFillAlpha: 0.25,
  roomStroke: '#000000',
  roomLabel: '#000000',
  roomSubLabel: '#000000',
  furnitureFill: '#ffffff',
  furnitureStroke: '#000000',
  dimension: '#0000cc',
  selection: '#cc0000',
  selectionFill: 'rgba(204, 0, 0, 0.12)',
  hover: '#cc0000',
  text: '#000000',
};

export function getTheme(theme: CanvasTheme, highContrast: boolean): RenderTheme {
  if (highContrast) return HIGH_CONTRAST;
  if (theme === 'blueprint') return BLUEPRINT;
  if (theme === 'dark') return DARK;
  return WHITE;
}

export const MATERIAL_FILL: Record<WallMaterial, string> = {
  brick: '#7f1d1d',
  concrete: '#475569',
  drywall: '#94a3b8',
  block: '#57534e',
  wood: '#92400e',
  glass: '#0ea5e9',
};

export const MATERIAL_LABEL: Record<WallMaterial, string> = {
  brick: 'Brick',
  concrete: 'Concrete',
  drywall: 'Drywall / Stud',
  block: 'Block',
  wood: 'Timber',
  glass: 'Glazed',
};
