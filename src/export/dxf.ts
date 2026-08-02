import type { LayerKind, Project, Vec2 } from '@/types';
import { arcFromBulge } from '@/core/geometry';
import { furnitureCorners, openingPlacement, wallOutline } from '@/core/entities';

/**
 * DXF R12 ASCII export.
 *
 * R12 is the most universally readable DXF flavour — every CAD package from
 * AutoCAD LT to QCAD and LibreCAD imports it without complaint, and it needs no
 * object handles or class tables, which keeps this generator small and exact.
 *
 * DXF is Y-up while our model is Y-down, so every point is emitted with its Y
 * negated. That single flip is the only coordinate conversion needed.
 */

/** AutoCAD Color Index per layer, chosen to look sane on a black CAD canvas. */
const LAYER_COLOR: Record<LayerKind, number> = {
  walls: 7, // white/black
  rooms: 8, // grey
  furniture: 3, // green
  dimensions: 5, // blue
  electrical: 2, // yellow
  plumbing: 4, // cyan
  hvac: 6, // magenta
  annotations: 1, // red
  images: 9,
};

const LAYER_NAME: Record<LayerKind, string> = {
  walls: 'A-WALL',
  rooms: 'A-AREA',
  furniture: 'I-FURN',
  dimensions: 'A-ANNO-DIMS',
  electrical: 'E-POWR',
  plumbing: 'P-SANR',
  hvac: 'M-HVAC',
  annotations: 'A-ANNO-TEXT',
  images: 'X-REFS',
};

class DxfWriter {
  private lines: string[] = [];

  tag(code: number, value: string | number) {
    this.lines.push(String(code), String(value));
  }

  section(name: string, body: () => void) {
    this.tag(0, 'SECTION');
    this.tag(2, name);
    body();
    this.tag(0, 'ENDSEC');
  }

  toString(): string {
    return `${this.lines.join('\r\n')}\r\n`;
  }
}

const X = (p: Vec2) => round(p.x);
const Y = (p: Vec2) => round(-p.y);
const round = (v: number) => Math.round(v * 1000) / 1000;

export function toDXF(project: Project): string {
  const w = new DxfWriter();
  const layerOf = (id: string): LayerKind =>
    project.layers.find((l) => l.id === id)?.kind ?? 'annotations';

  /* ------------------------------------------------------------- header */
  w.section('HEADER', () => {
    w.tag(9, '$ACADVER');
    w.tag(1, 'AC1009');
    w.tag(9, '$INSUNITS');
    w.tag(70, 4); // millimetres
    w.tag(9, '$EXTMIN');
    w.tag(10, -1000);
    w.tag(20, -1000);
    w.tag(9, '$EXTMAX');
    w.tag(10, round(project.width + 1000));
    w.tag(20, round(project.height + 1000));
  });

  /* ------------------------------------------------------------- tables */
  w.section('TABLES', () => {
    w.tag(0, 'TABLE');
    w.tag(2, 'LTYPE');
    w.tag(70, 2);
    for (const [name, pattern] of [
      ['CONTINUOUS', [] as number[]],
      ['DASHED', [12.5, -6.25]],
    ] as Array<[string, number[]]>) {
      w.tag(0, 'LTYPE');
      w.tag(2, name);
      w.tag(70, 0);
      w.tag(3, name === 'CONTINUOUS' ? 'Solid line' : '__ __ __');
      w.tag(72, 65);
      w.tag(73, pattern.length);
      w.tag(40, pattern.reduce((s, v) => s + Math.abs(v), 0));
      for (const seg of pattern) w.tag(49, seg);
    }
    w.tag(0, 'ENDTAB');

    w.tag(0, 'TABLE');
    w.tag(2, 'LAYER');
    w.tag(70, project.layers.length);
    for (const layer of project.layers) {
      w.tag(0, 'LAYER');
      w.tag(2, LAYER_NAME[layer.kind]);
      // Negative colour = layer off, which is how DXF stores hidden layers.
      w.tag(70, layer.locked ? 4 : 0);
      w.tag(62, layer.visible ? LAYER_COLOR[layer.kind] : -LAYER_COLOR[layer.kind]);
      w.tag(6, 'CONTINUOUS');
    }
    w.tag(0, 'ENDTAB');

    w.tag(0, 'TABLE');
    w.tag(2, 'STYLE');
    w.tag(70, 1);
    w.tag(0, 'STYLE');
    w.tag(2, 'STANDARD');
    w.tag(70, 0);
    w.tag(40, 0);
    w.tag(41, 1);
    w.tag(50, 0);
    w.tag(71, 0);
    w.tag(42, 2.5);
    w.tag(3, 'txt');
    w.tag(4, '');
    w.tag(0, 'ENDTAB');
  });

  /* ------------------------------------------------------------ entities */
  w.section('ENTITIES', () => {
    const polyline = (points: Vec2[], layer: string, closed: boolean) => {
      if (points.length < 2) return;
      w.tag(0, 'POLYLINE');
      w.tag(8, layer);
      w.tag(66, 1);
      w.tag(70, closed ? 1 : 0);
      w.tag(10, 0);
      w.tag(20, 0);
      w.tag(30, 0);
      for (const p of points) {
        w.tag(0, 'VERTEX');
        w.tag(8, layer);
        w.tag(10, X(p));
        w.tag(20, Y(p));
        w.tag(30, 0);
      }
      w.tag(0, 'SEQEND');
      w.tag(8, layer);
    };

    const lineSeg = (a: Vec2, b: Vec2, layer: string) => {
      w.tag(0, 'LINE');
      w.tag(8, layer);
      w.tag(10, X(a));
      w.tag(20, Y(a));
      w.tag(30, 0);
      w.tag(11, X(b));
      w.tag(21, Y(b));
      w.tag(31, 0);
    };

    const text = (at: Vec2, value: string, height: number, layer: string, rotation = 0) => {
      w.tag(0, 'TEXT');
      w.tag(8, layer);
      w.tag(10, X(at));
      w.tag(20, Y(at));
      w.tag(30, 0);
      w.tag(40, round(height));
      w.tag(1, value.replace(/\n/g, ' '));
      w.tag(50, round(-(rotation * 180) / Math.PI));
      w.tag(7, 'STANDARD');
    };

    for (const id of project.order) {
      const e = project.entities[id];
      if (!e || e.hidden) continue;
      const layer = LAYER_NAME[layerOf(e.layerId)];

      switch (e.type) {
        case 'wall': {
          // Emit the true wall outline so imported plans are poché-ready, plus
          // the centreline on a sub-layer for downstream modelling.
          polyline(wallOutline(e), layer, true);
          const arc = arcFromBulge(e.a, e.b, e.bulge);
          if (arc) {
            w.tag(0, 'ARC');
            w.tag(8, `${layer}-CNTR`);
            w.tag(10, X(arc.center));
            w.tag(20, Y(arc.center));
            w.tag(30, 0);
            w.tag(40, round(arc.radius));
            // Angles flip sign along with Y, so start/end swap.
            w.tag(50, round((-arc.endAngle * 180) / Math.PI));
            w.tag(51, round((-arc.startAngle * 180) / Math.PI));
          } else {
            lineSeg(e.a, e.b, `${layer}-CNTR`);
          }
          break;
        }
        case 'room': {
          polyline(e.polygon, layer, true);
          break;
        }
        case 'door':
        case 'window': {
          const wall = project.entities[e.wallId];
          if (!wall || wall.type !== 'wall') break;
          const pl = openingPlacement(e, wall);
          const h = { x: pl.across.x * (wall.thickness / 2), y: pl.across.y * (wall.thickness / 2) };
          // Jambs.
          lineSeg(
            { x: pl.start.x + h.x, y: pl.start.y + h.y },
            { x: pl.start.x - h.x, y: pl.start.y - h.y },
            layer,
          );
          lineSeg(
            { x: pl.end.x + h.x, y: pl.end.y + h.y },
            { x: pl.end.x - h.x, y: pl.end.y - h.y },
            layer,
          );
          if (e.type === 'door') {
            const dirSign = e.direction === 'in' ? 1 : -1;
            const hinge = e.swing === 'left' ? pl.start : pl.end;
            const tip = {
              x: hinge.x + pl.across.x * e.width * dirSign,
              y: hinge.y + pl.across.y * e.width * dirSign,
            };
            lineSeg(hinge, tip, layer);
            const sweepSign = e.swing === 'left' ? 1 : -1;
            const closed = {
              x: hinge.x + pl.along.x * e.width * sweepSign,
              y: hinge.y + pl.along.y * e.width * sweepSign,
            };
            const a0 = Math.atan2(-(tip.y - hinge.y), tip.x - hinge.x);
            const a1 = Math.atan2(-(closed.y - hinge.y), closed.x - hinge.x);
            w.tag(0, 'ARC');
            w.tag(8, layer);
            w.tag(10, X(hinge));
            w.tag(20, Y(hinge));
            w.tag(30, 0);
            w.tag(40, round(e.width));
            // DXF arcs always sweep counter-clockwise from start to end.
            const [start, end] = a0 <= a1 ? [a0, a1] : [a1, a0];
            w.tag(50, round((start * 180) / Math.PI));
            w.tag(51, round((end * 180) / Math.PI));
          } else {
            lineSeg(pl.start, pl.end, layer);
          }
          break;
        }
        case 'furniture': {
          polyline(furnitureCorners(e), layer, true);
          break;
        }
        case 'dimension': {
          for (let i = 0; i + 1 < e.points.length; i++) lineSeg(e.points[i], e.points[i + 1], layer);
          break;
        }
        case 'text': {
          text(e.position, e.text, e.size, layer, e.rotation);
          break;
        }
      }
    }

    // Room name/area labels as real TEXT so they are searchable in CAD.
    for (const id of project.order) {
      const e = project.entities[id];
      if (!e || e.type !== 'room' || e.hidden) continue;
      const c = e.polygon.reduce((s, p) => ({ x: s.x + p.x, y: s.y + p.y }), { x: 0, y: 0 });
      const center = { x: c.x / e.polygon.length, y: c.y / e.polygon.length };
      text(center, e.name, 250, LAYER_NAME.annotations);
    }

    // Title block text.
    const tb = project.titleBlock;
    text({ x: 0, y: -1200 }, tb.projectName || project.name, 400, LAYER_NAME.annotations);
    text(
      { x: 0, y: -700 },
      [tb.client, tb.drawnBy, tb.date, tb.sheet].filter(Boolean).join('  |  '),
      220,
      LAYER_NAME.annotations,
    );
  });

  w.tag(0, 'EOF');
  return w.toString();
}
