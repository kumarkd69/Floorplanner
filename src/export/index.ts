import type { Project, UIState } from '@/types';
import { projectBounds, roomMetrics, wallLength, wallsOf } from '@/core/entities';
import { expandRect } from '@/core/geometry';
import { formatArea, formatLength } from '@/core/units';
import { render } from '@/render/renderer';
import { fitRect } from '@/hooks/useViewportControls';
import { DEFAULT_SHEET, drawSheet, type SheetOptions } from './sheet';
import { toSVG } from './svg';
import { toDXF } from './dxf';

export type ExportFormat = 'json' | 'png' | 'svg' | 'dxf' | 'pdf';

export interface ExportOptions {
  format: ExportFormat;
  /** Output pixel width for raster export. */
  width: number;
  height: number;
  /** Multiplier for print resolution (2 ≈ 192 dpi, 4 ≈ 384 dpi). */
  resolution: number;
  sheet: SheetOptions;
  transparent: boolean;
}

export const DEFAULT_EXPORT: ExportOptions = {
  format: 'png',
  width: 1920,
  height: 1358, // A-series-ish landscape
  resolution: 2,
  sheet: { ...DEFAULT_SHEET },
  transparent: false,
};

/* --------------------------------------------------------------- helpers */

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function safeName(name: string): string {
  return name.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'floorplan';
}

/** Millimetres of paper per CSS pixel, at the 96 dpi CSS reference. */
export const MM_PER_CSS_PX = 25.4 / 96;

/**
 * Effective drawing scale as 1:N.
 *
 * N is world millimetres per millimetre of paper: a metre of building drawn
 * across a centimetre of sheet is 1:100. Device pixel ratio and export
 * resolution deliberately do not enter into it — they change how many pixels
 * the sheet is sampled at, not how large the drawing prints.
 */
export function scaleDenominator(pxPerMM: number): number {
  if (!Number.isFinite(pxPerMM) || pxPerMM <= 0) return 1;
  return Math.max(1, 1 / (pxPerMM * MM_PER_CSS_PX));
}

/* ----------------------------------------------------------------- JSON */

export function toJSON(project: Project): string {
  return JSON.stringify({ format: 'floorplanner/v1', project }, null, 2);
}

export function exportJSON(project: Project) {
  download(new Blob([toJSON(project)], { type: 'application/json' }), `${safeName(project.name)}.json`);
}

export function parseProjectFile(text: string): Project {
  const data = JSON.parse(text);
  const project: Project = data?.project ?? data;
  if (!project || typeof project !== 'object' || !project.entities || !project.layers) {
    throw new Error('Not a Floor Plan Creator file.');
  }
  // Tolerate files from older builds that lack newer optional fields.
  return {
    ...project,
    groups: project.groups ?? {},
    order: project.order ?? Object.keys(project.entities),
    titleBlock: project.titleBlock ?? {
      projectName: project.name,
      client: '',
      drawnBy: '',
      sheet: 'A-101',
      date: new Date().toISOString().slice(0, 10),
      notes: '',
    },
  };
}

/* ------------------------------------------------------------ raster */

/** Render the plan to an offscreen canvas at export resolution. */
export function renderToCanvas(
  project: Project,
  ui: UIState,
  opts: ExportOptions,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const w = Math.round(opts.width);
  const h = Math.round(opts.height);
  canvas.width = w * opts.resolution;
  canvas.height = h * opts.resolution;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable in this browser.');

  const bounds = projectBounds(project) ?? { x: 0, y: 0, w: project.width, h: project.height };
  // Leave room for the title block at the bottom.
  const usableH = opts.sheet.titleBlock ? h - 90 : h;
  const viewport = fitRect(expandRect(bounds, 400), w, usableH, 70);

  if (!opts.transparent) {
    ctx.setTransform(opts.resolution, 0, 0, opts.resolution, 0, 0);
    ctx.fillStyle = ui.theme === 'dark' ? '#0f172a' : ui.theme === 'blueprint' ? '#0b3d91' : '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  render({
    ctx,
    width: w,
    height: h,
    dpr: opts.resolution,
    project,
    ui: { ...ui, selection: [], hoverId: null },
    viewport,
    overlay: {},
    presentation: true,
  });

  ctx.setTransform(opts.resolution, 0, 0, opts.resolution, 0, 0);
  drawSheet(ctx, project, w, h, {
    ...opts.sheet,
    scaleDenominator: scaleDenominator(viewport.scale),
  });
  return canvas;
}

export async function exportPNG(project: Project, ui: UIState, opts: ExportOptions) {
  const canvas = renderToCanvas(project, ui, opts);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (blob) download(blob, `${safeName(project.name)}.png`);
}

/* -------------------------------------------------------------- vector */

export function exportSVG(project: Project, ui: UIState, opts: ExportOptions) {
  const svg = toSVG(project, ui, opts);
  download(new Blob([svg], { type: 'image/svg+xml' }), `${safeName(project.name)}.svg`);
}

export function exportDXF(project: Project) {
  download(new Blob([toDXF(project)], { type: 'application/dxf' }), `${safeName(project.name)}.dxf`);
}

/* ----------------------------------------------------------------- PDF */

/**
 * PDF export via the browser's print pipeline.
 *
 * We render the plan to a high-resolution PNG and drop it into a print window
 * sized to the sheet. This produces a correct, vector-crisp-enough PDF through
 * "Save as PDF" without shipping a multi-megabyte PDF library.
 */
export function exportPDF(project: Project, ui: UIState, opts: ExportOptions) {
  const canvas = renderToCanvas(project, ui, { ...opts, resolution: Math.max(3, opts.resolution) });
  const dataUrl = canvas.toDataURL('image/png');
  const landscape = opts.width >= opts.height;

  const win = window.open('', '_blank');
  if (!win) {
    // Popup blocked — fall back to a PNG download so the user still gets output.
    canvas.toBlob((b) => {
      if (b) download(b, `${safeName(project.name)}.png`);
    }, 'image/png');
    return;
  }

  win.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(project.name)}</title>
<style>
  @page { size: A3 ${landscape ? 'landscape' : 'portrait'}; margin: 8mm; }
  html, body { margin: 0; padding: 0; background: #fff; }
  img { width: 100%; height: auto; display: block; }
  @media screen { body { padding: 16px; background: #e2e8f0; } img { box-shadow: 0 8px 30px rgba(0,0,0,.2); } }
</style></head>
<body><img src="${dataUrl}" alt="${escapeHtml(project.name)} floor plan"></body></html>`);
  win.document.close();
  win.focus();
  // Wait for the image to decode before invoking print.
  const img = win.document.querySelector('img');
  const go = () => setTimeout(() => win.print(), 150);
  if (img && !img.complete) img.addEventListener('load', go);
  else go();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/* ------------------------------------------------------------ schedules */

export interface ScheduleRow {
  mark: string;
  type: string;
  size: string;
  detail: string;
}

export function doorSchedule(project: Project): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  let i = 1;
  for (const id of project.order) {
    const e = project.entities[id];
    if (!e || e.type !== 'door') continue;
    rows.push({
      mark: `D${String(i++).padStart(2, '0')}`,
      type: e.kind,
      size: `${formatLength(e.width, project.unit, { compact: true })} × ${formatLength(e.height, project.unit, { compact: true })}`,
      detail: `${e.material}, ${e.frame} frame, ${e.swing}-hand, opens ${e.direction}`,
    });
  }
  return rows;
}

export function windowSchedule(project: Project): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  let i = 1;
  for (const id of project.order) {
    const e = project.entities[id];
    if (!e || e.type !== 'window') continue;
    rows.push({
      mark: `W${String(i++).padStart(2, '0')}`,
      type: e.kind,
      size: `${formatLength(e.width, project.unit, { compact: true })} × ${formatLength(e.height, project.unit, { compact: true })}`,
      detail: `${e.glass}, ${e.frame} frame, sill ${formatLength(e.sill, project.unit, { compact: true })}`,
    });
  }
  return rows;
}

export function roomSchedule(project: Project): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  let i = 1;
  for (const id of project.order) {
    const e = project.entities[id];
    if (!e || e.type !== 'room') continue;
    const { area, perimeter } = roomMetrics(e);
    rows.push({
      mark: `R${String(i++).padStart(2, '0')}`,
      type: e.name,
      size: formatArea(area, project.unit),
      detail: `Perimeter ${formatLength(perimeter, project.unit, { compact: true })} · ${e.floorFinish} floor`,
    });
  }
  return rows;
}

export function wallSchedule(project: Project): ScheduleRow[] {
  return wallsOf(project).map((w, i) => ({
    mark: `WA${String(i + 1).padStart(2, '0')}`,
    type: w.exterior ? 'Exterior' : 'Interior',
    size: `${formatLength(wallLength(w), project.unit, { compact: true })} × ${formatLength(w.thickness, project.unit, { compact: true })}`,
    detail: `${w.material}, height ${formatLength(w.height, project.unit, { compact: true })}`,
  }));
}

export function scheduleToCSV(rows: ScheduleRow[]): string {
  const head = 'Mark,Type,Size,Detail';
  const body = rows
    .map((r) => [r.mark, r.type, r.size, r.detail].map((c) => `"${c.replace(/"/g, '""')}"`).join(','))
    .join('\n');
  return `${head}\n${body}`;
}

export function exportSchedulesCSV(project: Project) {
  const text = [
    'DOOR SCHEDULE',
    scheduleToCSV(doorSchedule(project)),
    '',
    'WINDOW SCHEDULE',
    scheduleToCSV(windowSchedule(project)),
    '',
    'ROOM SCHEDULE',
    scheduleToCSV(roomSchedule(project)),
    '',
    'WALL SCHEDULE',
    scheduleToCSV(wallSchedule(project)),
  ].join('\n');
  download(new Blob([text], { type: 'text/csv' }), `${safeName(project.name)}-schedules.csv`);
}

export { drawSheet, DEFAULT_SHEET };
export type { SheetOptions };
