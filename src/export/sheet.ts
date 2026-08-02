import type { Project } from '@/types';
import { formatLength } from '@/core/units';
import { MM_PER_CSS_PX } from './index';
import { roomMetrics } from '@/core/entities';

export interface SheetOptions {
  titleBlock: boolean;
  northArrow: boolean;
  scaleBar: boolean;
  legend: boolean;
  /** Drawing scale as 1:N, computed from the render. */
  scaleDenominator: number;
}

/** Height of the title block strip, in CSS pixels of the sheet. */
export const TITLE_BLOCK_H = 76;

export const DEFAULT_SHEET: SheetOptions = {
  titleBlock: true,
  northArrow: true,
  scaleBar: true,
  legend: true,
  scaleDenominator: 100,
};

/**
 * Draw the sheet furniture (title block, north arrow, scale bar, legend) in
 * screen space over an already-rendered plan.
 *
 * These are deliberately drawn last and in pixel coordinates so they keep a
 * fixed physical size on the printed sheet regardless of the plan's zoom.
 */
export function drawSheet(
  ctx: CanvasRenderingContext2D,
  project: Project,
  width: number,
  height: number,
  opts: SheetOptions,
) {
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  const pad = 24;
  // Reserve the title block strip so the scale bar never lands on top of it.
  const footer = opts.titleBlock ? TITLE_BLOCK_H : 0;

  if (opts.northArrow) drawNorthArrow(ctx, width - pad - 40, pad + 46);
  if (opts.scaleBar) {
    drawScaleBar(ctx, project, pad, height - footer - pad - 26, opts.scaleDenominator);
  }
  if (opts.legend) drawLegend(ctx, project, pad, pad);
  if (opts.titleBlock) drawTitleBlock(ctx, project, width, height, opts);

  ctx.restore();
}

function drawNorthArrow(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  const r = 26;
  ctx.save();
  ctx.strokeStyle = '#0f172a';
  ctx.fillStyle = '#0f172a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy - r + 4);
  ctx.lineTo(cx + 9, cy + r - 10);
  ctx.lineTo(cx, cy + r - 16);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx, cy - r + 4);
  ctx.lineTo(cx - 9, cy + r - 10);
  ctx.lineTo(cx, cy + r - 16);
  ctx.closePath();
  ctx.stroke();
  ctx.font = '700 12px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', cx, cy - r - 6);
  ctx.restore();
}

function drawScaleBar(
  ctx: CanvasRenderingContext2D,
  project: Project,
  x: number,
  y: number,
  denominator: number,
) {
  // Pick a round real-world length that renders 80–200 px wide.
  const pxPerMM = 1 / (denominator * MM_PER_CSS_PX);
  const candidates =
    project.unit === 'ft' || project.unit === 'in'
      ? [304.8, 914.4, 1524, 3048, 6096, 15240, 30480]
      : [500, 1000, 2000, 5000, 10000, 20000];
  let barMM = candidates[0];
  for (const c of candidates) {
    if (c * pxPerMM <= 200) barMM = c;
  }
  const w = Math.max(40, barMM * pxPerMM);
  const h = 8;

  ctx.save();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1;
  const segs = 4;
  for (let i = 0; i < segs; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#0f172a' : '#ffffff';
    ctx.fillRect(x + (w / segs) * i, y, w / segs, h);
    ctx.strokeRect(x + (w / segs) * i, y, w / segs, h);
  }
  ctx.fillStyle = '#0f172a';
  ctx.font = '11px Inter, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('0', x, y + h + 14);
  ctx.textAlign = 'right';
  ctx.fillText(formatLength(barMM, project.unit, { compact: true }), x + w + 2, y + h + 14);
  ctx.textAlign = 'left';
  ctx.fillText(`Scale 1:${Math.round(denominator)}`, x, y - 6);
  ctx.restore();
}

function drawLegend(ctx: CanvasRenderingContext2D, project: Project, x: number, y: number) {
  const rooms = Object.values(project.entities).filter(
    (e): e is Extract<typeof e, { type: 'room' }> => e.type === 'room',
  );
  if (rooms.length === 0) return;

  const rows = rooms.slice(0, 14);
  const w = 210;
  const h = 30 + rows.length * 17;

  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.font = '700 11px Inter, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('ROOM SCHEDULE', x + 12, y + 19);
  ctx.font = '11px Inter, system-ui, sans-serif';

  let ty = y + 38;
  for (const r of rows) {
    const { area } = roomMetrics(r);
    ctx.fillStyle = r.color;
    ctx.fillRect(x + 12, ty - 8, 10, 10);
    ctx.strokeStyle = '#94a3b8';
    ctx.strokeRect(x + 12, ty - 8, 10, 10);
    ctx.fillStyle = '#0f172a';
    ctx.fillText(clip(ctx, r.name, 110), x + 28, ty);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#475569';
    ctx.fillText(
      project.unit === 'ft' || project.unit === 'in'
        ? `${(area / (304.8 * 304.8)).toFixed(0)} ft²`
        : `${(area / 1e6).toFixed(1)} m²`,
      x + w - 12,
      ty,
    );
    ctx.textAlign = 'left';
    ty += 17;
  }
  ctx.restore();
}

function drawTitleBlock(
  ctx: CanvasRenderingContext2D,
  project: Project,
  width: number,
  height: number,
  opts: SheetOptions,
) {
  const h = TITLE_BLOCK_H;
  const y = height - h;
  const tb = project.titleBlock;

  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  ctx.fillRect(0, y, width, h);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(width, y);
  ctx.stroke();

  const cells: Array<[string, string]> = [
    ['PROJECT', tb.projectName || project.name],
    ['CLIENT', tb.client || '—'],
    ['DRAWN BY', tb.drawnBy || '—'],
    ['SCALE', `1:${Math.round(opts.scaleDenominator)}`],
    ['DATE', tb.date],
    ['SHEET', tb.sheet],
  ];

  const cw = width / cells.length;
  ctx.textAlign = 'left';
  cells.forEach(([k, v], i) => {
    const x = i * cw;
    if (i > 0) {
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y + 10);
      ctx.lineTo(x, y + h - 10);
      ctx.stroke();
    }
    ctx.fillStyle = '#64748b';
    ctx.font = '600 9px Inter, system-ui, sans-serif';
    ctx.fillText(k, x + 14, y + 26);
    ctx.fillStyle = '#0f172a';
    ctx.font = '600 14px Inter, system-ui, sans-serif';
    ctx.fillText(clip(ctx, v, cw - 28), x + 14, y + 48);
  });

  if (tb.notes) {
    ctx.fillStyle = '#475569';
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.fillText(clip(ctx, tb.notes, width - 28), 14, y + 66);
  }
  ctx.restore();
}

function clip(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}
