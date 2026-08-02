import type { Project, UIState, Vec2 } from '@/types';
import {
  furnitureCorners,
  openingPlacement,
  projectBounds,
  roomMetrics,
  wallOutline,
} from '@/core/entities';
import { add, dist, mid, mul, normalize, polygonLabelPoint, sub } from '@/core/geometry';
import { formatArea, formatLength } from '@/core/units';
import { getTheme } from '@/render/theme';
import type { ExportOptions } from './index';

const n = (x: number) => Math.round(x * 100) / 100;
const pts = (p: Vec2[]) => p.map((q) => `${n(q.x)},${n(q.y)}`).join(' ');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Vector export.
 *
 * The SVG is emitted in world millimetres with a viewBox covering the plan, so
 * the file opens at true scale in Illustrator/Inkscape and stays editable —
 * that matters more for a professional handoff than matching the screen pixel
 * for pixel.
 */
export function toSVG(project: Project, ui: UIState, opts: ExportOptions): string {
  const theme = getTheme(ui.theme, ui.highContrast);
  const bounds = projectBounds(project) ?? { x: 0, y: 0, w: project.width, h: project.height };
  const pad = 600;
  const vb = {
    x: bounds.x - pad,
    y: bounds.y - pad,
    w: bounds.w + pad * 2,
    h: bounds.h + pad * 2,
  };

  const body: string[] = [];
  const layerRank = new Map(project.layers.map((l, i) => [l.id, i]));
  const order = [...project.order].sort((a, b) => {
    const ea = project.entities[a];
    const eb = project.entities[b];
    if (!ea || !eb) return 0;
    return (layerRank.get(ea.layerId) ?? 0) - (layerRank.get(eb.layerId) ?? 0);
  });

  const visible = (id: string) => {
    const e = project.entities[id];
    if (!e || e.hidden) return false;
    const layer = project.layers.find((l) => l.id === e.layerId);
    return !layer || layer.visible;
  };

  // Rooms.
  for (const id of order) {
    const e = project.entities[id];
    if (!e || e.type !== 'room' || !visible(id)) continue;
    body.push(
      `<polygon points="${pts(e.polygon)}" fill="${e.color}" fill-opacity="${theme.roomFillAlpha}" stroke="${theme.roomStroke}" stroke-width="6"/>`,
    );
  }

  // Walls, with openings punched via a mask.
  const maskParts: string[] = [];
  const wallParts: string[] = [];
  for (const id of order) {
    const e = project.entities[id];
    if (!e || e.type !== 'wall' || !visible(id)) continue;
    const fill = e.exterior ? theme.wallExteriorFill : theme.wallFill;
    wallParts.push(
      `<polygon points="${pts(wallOutline(e))}" fill="${fill}" stroke="${theme.wallStroke}" stroke-width="8"/>`,
    );
    for (const op of Object.values(project.entities)) {
      if ((op.type !== 'door' && op.type !== 'window') || op.wallId !== e.id || op.hidden) continue;
      const pl = openingPlacement(op, e);
      const h = mul(pl.across, e.thickness / 2 + 6);
      maskParts.push(
        `<polygon points="${pts([
          add(pl.start, h),
          add(pl.end, h),
          sub(pl.end, h),
          sub(pl.start, h),
        ])}" fill="#000"/>`,
      );
    }
  }
  if (wallParts.length > 0) {
    body.push(
      `<mask id="openings" maskUnits="userSpaceOnUse" x="${n(vb.x)}" y="${n(vb.y)}" width="${n(vb.w)}" height="${n(vb.h)}">` +
        `<rect x="${n(vb.x)}" y="${n(vb.y)}" width="${n(vb.w)}" height="${n(vb.h)}" fill="#fff"/>${maskParts.join('')}</mask>`,
    );
    body.push(`<g mask="url(#openings)">${wallParts.join('')}</g>`);
  }

  // Openings: jambs and symbols.
  for (const id of order) {
    const e = project.entities[id];
    if (!e || !visible(id)) continue;
    const wall = (e.type === 'door' || e.type === 'window') ? project.entities[e.wallId] : null;
    if ((e.type === 'door' || e.type === 'window') && wall && wall.type === 'wall') {
      const pl = openingPlacement(e, wall);
      const h = mul(pl.across, wall.thickness / 2);
      body.push(
        `<path d="M${n(pl.start.x + h.x)} ${n(pl.start.y + h.y)}L${n(pl.start.x - h.x)} ${n(pl.start.y - h.y)}` +
          `M${n(pl.end.x + h.x)} ${n(pl.end.y + h.y)}L${n(pl.end.x - h.x)} ${n(pl.end.y - h.y)}" stroke="${theme.openingStroke}" stroke-width="8" fill="none"/>`,
      );
      if (e.type === 'door') {
        const hinge = e.swing === 'left' ? pl.start : pl.end;
        const dirSign = e.direction === 'in' ? 1 : -1;
        const tip = add(hinge, mul(pl.across, e.width * dirSign));
        const sweepTo = add(hinge, mul(pl.along, e.swing === 'left' ? e.width : -e.width));
        body.push(
          `<path d="M${n(hinge.x)} ${n(hinge.y)}L${n(tip.x)} ${n(tip.y)}" stroke="${theme.openingStroke}" stroke-width="10" fill="none"/>`,
        );
        body.push(
          `<path d="M${n(tip.x)} ${n(tip.y)}A${n(e.width)} ${n(e.width)} 0 0 ${dirSign > 0 ? 1 : 0} ${n(sweepTo.x)} ${n(sweepTo.y)}" stroke="${theme.openingStroke}" stroke-width="4" stroke-dasharray="40 30" fill="none"/>`,
        );
      } else {
        body.push(
          `<path d="M${n(pl.start.x)} ${n(pl.start.y)}L${n(pl.end.x)} ${n(pl.end.y)}" stroke="${theme.openingStroke}" stroke-width="6" fill="none"/>`,
        );
      }
    } else if (e.type === 'furniture') {
      // Symbols are canvas-drawn; export their footprint plus a label so the
      // vector file stays meaningful without duplicating every symbol path.
      const c = furnitureCorners(e);
      body.push(
        `<polygon points="${pts(c)}" fill="${e.color ?? theme.furnitureFill}" stroke="${theme.furnitureStroke}" stroke-width="6"/>`,
      );
    } else if (e.type === 'dimension' && e.points.length >= 2) {
      const a = e.points[0];
      const b = e.points[1];
      const d = normalize(sub(b, a));
      const nn = { x: d.y, y: -d.x };
      const oa = add(a, mul(nn, e.offset));
      const ob = add(b, mul(nn, e.offset));
      const m = mid(oa, ob);
      body.push(
        `<path d="M${n(oa.x)} ${n(oa.y)}L${n(ob.x)} ${n(ob.y)}" stroke="${theme.dimension}" stroke-width="6" fill="none"/>`,
      );
      body.push(
        `<text x="${n(m.x)}" y="${n(m.y - 60)}" font-size="220" text-anchor="middle" fill="${theme.dimension}" font-family="Inter, sans-serif">${esc(
          e.label ?? formatLength(dist(a, b), project.unit),
        )}</text>`,
      );
    } else if (e.type === 'text') {
      body.push(
        `<text x="${n(e.position.x)}" y="${n(e.position.y)}" font-size="${n(e.size)}" fill="${theme.text}" font-family="Inter, sans-serif" transform="rotate(${n(
          (e.rotation * 180) / Math.PI,
        )} ${n(e.position.x)} ${n(e.position.y)})">${esc(e.text)}</text>`,
      );
    }
  }

  // Room labels last so they sit on top.
  if (ui.showRoomLabels) {
    for (const id of order) {
      const e = project.entities[id];
      if (!e || e.type !== 'room' || !visible(id)) continue;
      const c = polygonLabelPoint(e.polygon);
      const { area } = roomMetrics(e);
      body.push(
        `<text x="${n(c.x)}" y="${n(c.y)}" font-size="300" font-weight="600" text-anchor="middle" fill="${theme.roomLabel}" font-family="Inter, sans-serif">${esc(e.name)}</text>`,
      );
      body.push(
        `<text x="${n(c.x)}" y="${n(c.y + 340)}" font-size="240" text-anchor="middle" fill="${theme.roomSubLabel}" font-family="Inter, sans-serif">${esc(
          formatArea(area, project.unit),
        )}</text>`,
      );
    }
  }

  // Sheet furniture, positioned in world units at the drawing edges.
  if (opts.sheet.titleBlock) {
    const tb = project.titleBlock;
    const y = vb.y + vb.h - 260;
    body.push(
      `<text x="${n(vb.x + 200)}" y="${n(y)}" font-size="320" font-weight="700" fill="${theme.text}" font-family="Inter, sans-serif">${esc(
        tb.projectName || project.name,
      )}</text>`,
      `<text x="${n(vb.x + 200)}" y="${n(y + 320)}" font-size="220" fill="${theme.roomSubLabel}" font-family="Inter, sans-serif">${esc(
        [tb.client, tb.drawnBy, tb.date, tb.sheet].filter(Boolean).join('  ·  '),
      )}</text>`,
    );
  }
  if (opts.sheet.northArrow) {
    const cx = vb.x + vb.w - 500;
    const cy = vb.y + 600;
    body.push(
      `<g stroke="${theme.text}" fill="${theme.text}" stroke-width="14"><circle cx="${n(cx)}" cy="${n(cy)}" r="300" fill="none"/>` +
        `<polygon points="${n(cx)},${n(cy - 260)} ${n(cx + 110)},${n(cy + 220)} ${n(cx)},${n(cy + 100)}"/>` +
        `<polygon points="${n(cx)},${n(cy - 260)} ${n(cx - 110)},${n(cy + 220)} ${n(cx)},${n(cy + 100)}" fill="none"/>` +
        `<text x="${n(cx)}" y="${n(cy - 380)}" font-size="240" text-anchor="middle" stroke="none" font-family="Inter, sans-serif">N</text></g>`,
    );
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${opts.width}" height="${opts.height}" viewBox="${n(vb.x)} ${n(vb.y)} ${n(vb.w)} ${n(vb.h)}" preserveAspectRatio="xMidYMid meet">
<title>${esc(project.name)}</title>
<desc>Generated by Floor Plan Creator. Units: millimetres.</desc>
<rect x="${n(vb.x)}" y="${n(vb.y)}" width="${n(vb.w)}" height="${n(vb.h)}" fill="${opts.transparent ? 'none' : theme.background}"/>
${body.join('\n')}
</svg>`;
}
