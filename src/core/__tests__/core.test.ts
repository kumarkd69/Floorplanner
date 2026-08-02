import { describe, expect, it } from 'vitest';
import {
  arcFromBulge,
  closestOnSegment,
  curveLength,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  polygonLabelPoint,
  polygonPerimeter,
  rectContainsRect,
  segmentIntersection,
  signedArea,
} from '../geometry';
import {
  feetOf,
  formatArea,
  formatLength,
  fromMM,
  mmOfFeet,
  niceGridStep,
  parseArea,
  parseLength,
  toMM,
} from '../units';
import { classifyRoom, detectEnclosures } from '../rooms';
import { clampOpeningT, openingsOverlap, wallLength, wallOutline } from '../entities';
import { mergeWalls, splitWall, weldWallJoints } from '../wallOps';
import { snapPoint } from '../snapping';
import { createProject } from '@/state/project';
import { toDXF } from '@/export/dxf';
import {
  buildRoomBox,
  clampRectToPlot,
  findPlot,
  resizeRoomBox,
  roomRect,
  setRoomArea,
} from '../roomBox';
import { mm2OfSqft, sqftOf } from '../units';
import { MM_PER_CSS_PX, scaleDenominator } from '@/export';
import type { Project, Wall } from '@/types';

/* ------------------------------------------------------------------ units */

describe('units', () => {
  it('round-trips feet through millimetres', () => {
    expect(fromMM(toMM(12.5))).toBeCloseTo(12.5, 9);
    expect(mmOfFeet(10)).toBeCloseTo(3048, 9);
    expect(feetOf(3048)).toBeCloseTo(10, 9);
  });

  it('formats every length in feet and nothing else', () => {
    expect(formatLength(304.8)).toBe("1'");
    expect(formatLength(304.8 * 12 + 25.4 * 6)).toBe("12.5'");
    expect(formatLength(25.4 * 6)).toBe("0.5'");
    // Metric input is converted, never displayed.
    expect(formatLength(2500)).toBe("8.2'");
  });

  it('parses every notation the inspector accepts', () => {
    expect(parseLength('12\'6"', 'ft')).toBeCloseTo(304.8 * 12 + 25.4 * 6, 6);
    expect(parseLength('3.5m', 'ft')).toBeCloseTo(3500, 6);
    expect(parseLength('450mm', 'ft')).toBeCloseTo(450, 6);
    // A bare number is always feet now.
    expect(parseLength('10')).toBeCloseTo(3048, 6);
    expect(parseLength('12.5')).toBeCloseTo(3810, 6);
    expect(parseLength('18in')).toBeCloseTo(457.2, 6);
    expect(parseLength('nonsense')).toBeNull();
  });

  it('reports area in square feet', () => {
    expect(formatArea(304.8 * 304.8)).toBe('1 ft²');
    expect(formatArea(304.8 * 304.8 * 120)).toBe('120 ft²');
  });

  it('parses an area typed in square feet', () => {
    expect(parseArea('120')).toBeCloseTo(120 * 304.8 * 304.8, 3);
    expect(parseArea('120 sq ft')).toBeCloseTo(120 * 304.8 * 304.8, 3);
    expect(parseArea('0')).toBeNull();
    expect(parseArea('abc')).toBeNull();
  });

  it('never picks a grid step that would crowd the screen', () => {
    const pxPerMM = 0.01;
    const step = niceGridStep('ft', 8, pxPerMM);
    expect(step * pxPerMM).toBeGreaterThanOrEqual(8);
  });
});

/* --------------------------------------------------------------- geometry */

describe('geometry', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];

  it('measures polygons', () => {
    expect(polygonArea(square)).toBe(10000);
    expect(polygonPerimeter(square)).toBe(400);
    expect(polygonCentroid(square)).toEqual({ x: 50, y: 50 });
    // Clockwise in screen coordinates gives positive signed area.
    expect(signedArea(square)).toBeGreaterThan(0);
  });

  it('tests point containment', () => {
    expect(pointInPolygon({ x: 50, y: 50 }, square)).toBe(true);
    expect(pointInPolygon({ x: 150, y: 50 }, square)).toBe(false);
  });

  it('keeps concave room labels inside the room', () => {
    // An L-shape whose centroid falls in the notch.
    const L = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 30 },
      { x: 30, y: 30 },
      { x: 30, y: 100 },
      { x: 0, y: 100 },
    ];
    expect(pointInPolygon(polygonCentroid(L), L)).toBe(false);
    expect(pointInPolygon(polygonLabelPoint(L), L)).toBe(true);
  });

  it('intersects segments only within their extents', () => {
    const hit = segmentIntersection({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: -5 }, { x: 5, y: 5 });
    expect(hit).toEqual({ x: 5, y: 0 });
    expect(
      segmentIntersection({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 50, y: -5 }, { x: 50, y: 5 }),
    ).toBeNull();
    // Parallel lines never intersect.
    expect(
      segmentIntersection({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 }),
    ).toBeNull();
  });

  it('clamps to segment ends when projecting past them', () => {
    const r = closestOnSegment({ x: -50, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    expect(r.t).toBe(0);
    expect(r.point).toEqual({ x: 0, y: 0 });
  });

  it('builds an arc whose length exceeds its chord', () => {
    const arc = arcFromBulge({ x: 0, y: 0 }, { x: 100, y: 0 }, 0.25);
    expect(arc).not.toBeNull();
    expect(arc!.radius).toBeGreaterThan(50);
    expect(curveLength({ x: 0, y: 0 }, { x: 100, y: 0 }, 0.25)).toBeGreaterThan(100);
    // A zero bulge is a straight line.
    expect(arcFromBulge({ x: 0, y: 0 }, { x: 100, y: 0 }, 0)).toBeNull();
    expect(curveLength({ x: 0, y: 0 }, { x: 100, y: 0 }, 0)).toBe(100);
  });

  it('contains rectangles strictly', () => {
    const outer = { x: 0, y: 0, w: 100, h: 100 };
    expect(rectContainsRect(outer, { x: 10, y: 10, w: 10, h: 10 })).toBe(true);
    expect(rectContainsRect(outer, { x: 95, y: 10, w: 10, h: 10 })).toBe(false);
  });
});

/* ------------------------------------------------------------------ walls */

function makeWall(ax: number, ay: number, bx: number, by: number, layerId = 'L'): Wall {
  return {
    id: `w${ax}-${ay}-${bx}-${by}`,
    type: 'wall',
    layerId,
    a: { x: ax, y: ay },
    b: { x: bx, y: by },
    bulge: 0,
    thickness: 200,
    height: 2700,
    material: 'brick',
    exterior: false,
    locked: false,
    hidden: false,
  };
}

function projectWith(walls: Wall[]): Project {
  const p = createProject({ name: 'T', width: 1, height: 1, unit: 'm', outerWalls: false });
  for (const w of walls) {
    p.entities[w.id] = w;
    p.order.push(w.id);
  }
  return p;
}

describe('walls', () => {
  it('outlines a wall at its full thickness', () => {
    const w = makeWall(0, 0, 1000, 0);
    const outline = wallOutline(w);
    const ys = outline.map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(w.thickness, 6);
    expect(wallLength(w)).toBe(1000);
  });

  it('welds near-coincident endpoints so corners close', () => {
    // Two walls meeting with a 5 mm gap — inside the joint tolerance.
    const a = makeWall(0, 0, 1000, 0);
    const b = { ...makeWall(1005, 0, 1005, 1000), id: 'b' };
    const project = projectWith([a, b]);
    const welded = weldWallJoints(project, [b.id]);
    const wb = welded.entities[b.id] as Wall;
    expect(wb.a.x).toBeCloseTo(1000, 6);
  });

  it('leaves genuinely separate walls alone', () => {
    const a = makeWall(0, 0, 1000, 0);
    const b = { ...makeWall(1500, 0, 1500, 1000), id: 'b' };
    const welded = weldWallJoints(projectWith([a, b]), [b.id]);
    expect((welded.entities.b as Wall).a.x).toBe(1500);
  });

  it('splits a wall and rehomes its openings', () => {
    const wall = makeWall(0, 0, 1000, 0);
    const project = projectWith([wall]);
    project.entities.d1 = {
      id: 'd1',
      type: 'door',
      layerId: 'L',
      wallId: wall.id,
      t: 0.8, // past the split point
      width: 100,
      height: 2000,
      kind: 'single',
      swing: 'left',
      direction: 'in',
      frame: '',
      material: '',
      locked: false,
      hidden: false,
    };
    project.order.push('d1');

    const next = splitWall(project, wall.id, { x: 500, y: 0 });
    const walls = Object.values(next.entities).filter((e): e is Wall => e.type === 'wall');
    expect(walls).toHaveLength(2);

    const door = next.entities.d1;
    expect(door.type).toBe('door');
    if (door.type === 'door') {
      // The door moved to the second wall, re-parameterised against it.
      expect(door.wallId).not.toBe(wall.id);
      expect(door.t).toBeCloseTo(0.6, 6);
    }
  });

  it('refuses to split at the very ends', () => {
    const wall = makeWall(0, 0, 1000, 0);
    const project = projectWith([wall]);
    expect(splitWall(project, wall.id, { x: 5, y: 0 })).toBe(project);
  });

  it('merges collinear walls that share a joint', () => {
    const a = makeWall(0, 0, 500, 0);
    const b = { ...makeWall(500, 0, 1000, 0), id: 'b' };
    const merged = mergeWalls(projectWith([a, b]), a.id, 'b');
    const walls = Object.values(merged.entities).filter((e): e is Wall => e.type === 'wall');
    expect(walls).toHaveLength(1);
    expect(wallLength(walls[0])).toBeCloseTo(1000, 6);
  });

  it('refuses to merge walls that are not collinear', () => {
    const a = makeWall(0, 0, 500, 0);
    const b = { ...makeWall(500, 0, 500, 500), id: 'b' };
    const project = projectWith([a, b]);
    expect(mergeWalls(project, a.id, 'b')).toBe(project);
  });
});

/* --------------------------------------------------------------- openings */

describe('openings', () => {
  const wall = makeWall(0, 0, 2000, 0);

  it('clamps an opening so it can never hang off the wall', () => {
    expect(clampOpeningT(800, wall, 0)).toBeCloseTo(0.2, 6);
    expect(clampOpeningT(800, wall, 1)).toBeCloseTo(0.8, 6);
    // A wall shorter than the opening centres it rather than producing NaN.
    expect(clampOpeningT(4000, wall, 0.9)).toBe(0.5);
  });

  it('detects overlapping openings on the same wall', () => {
    expect(openingsOverlap({ t: 0.3, width: 800 }, { t: 0.5, width: 800 }, wall)).toBe(true);
    expect(openingsOverlap({ t: 0.2, width: 400 }, { t: 0.8, width: 400 }, wall)).toBe(false);
  });
});

/* ------------------------------------------------------------------ rooms */

describe('room detection', () => {
  it('finds the enclosure formed by four walls', () => {
    const walls = [
      makeWall(0, 0, 4000, 0),
      { ...makeWall(4000, 0, 4000, 3000), id: 'w2' },
      { ...makeWall(4000, 3000, 0, 3000), id: 'w3' },
      { ...makeWall(0, 3000, 0, 0), id: 'w4' },
    ];
    const faces = detectEnclosures(walls);
    expect(faces).toHaveLength(1);
    expect(polygonArea(faces[0])).toBeCloseTo(4000 * 3000, -3);
  });

  it('finds both rooms when a partition divides a rectangle', () => {
    const walls = [
      makeWall(0, 0, 4000, 0),
      { ...makeWall(4000, 0, 4000, 3000), id: 'w2' },
      { ...makeWall(4000, 3000, 0, 3000), id: 'w3' },
      { ...makeWall(0, 3000, 0, 0), id: 'w4' },
      { ...makeWall(2000, 0, 2000, 3000), id: 'w5' },
    ];
    const faces = detectEnclosures(walls);
    expect(faces).toHaveLength(2);
    for (const f of faces) expect(polygonArea(f)).toBeCloseTo(2000 * 3000, -3);
  });

  it('finds nothing when the walls do not close', () => {
    const walls = [
      makeWall(0, 0, 4000, 0),
      { ...makeWall(4000, 0, 4000, 3000), id: 'w2' },
      { ...makeWall(4000, 3000, 0, 3000), id: 'w3' },
    ];
    expect(detectEnclosures(walls)).toHaveLength(0);
  });

  it('classifies rooms by size and proportion', () => {
    const rect = (w: number, h: number) => [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ];
    expect(classifyRoom(rect(8000, 6000))).toBe('living'); // 48 m²
    expect(classifyRoom(rect(3500, 3500))).toBe('bedroom'); // 12.25 m²
    expect(classifyRoom(rect(2000, 2200))).toBe('bathroom'); // 4.4 m²
    expect(classifyRoom(rect(8000, 1200))).toBe('hallway'); // long and narrow
  });
});

/* -------------------------------------------------------------- snapping */

describe('snapping', () => {
  const project = projectWith([makeWall(0, 0, 1000, 0)]);
  const ctx = (radius = 12) => ({
    project,
    settings: {
      enabled: true,
      grid: true,
      endpoint: true,
      midpoint: true,
      edge: true,
      center: true,
      furniture: true,
      angle: false,
      guides: true,
      radius,
      angleStep: 15,
    },
    worldPerPx: 1,
  });

  it('prefers a wall endpoint over the grid', () => {
    const r = snapPoint({ x: 4, y: 3 }, ctx());
    expect(r.point).toEqual({ x: 0, y: 0 });
    expect(r.kinds).toContain('endpoint');
  });

  it('falls back to the grid away from geometry', () => {
    const p = projectWith([]);
    const r = snapPoint({ x: 502, y: 498 }, { ...ctx(), project: p });
    expect(r.point).toEqual({ x: 500, y: 500 });
    expect(r.kinds).toEqual(['grid']);
  });

  it('returns the raw point when snapping is off', () => {
    const c = ctx();
    const r = snapPoint({ x: 4, y: 3 }, { ...c, settings: { ...c.settings, enabled: false } });
    expect(r.point).toEqual({ x: 4, y: 3 });
    expect(r.kinds).toHaveLength(0);
  });
});

/* -------------------------------------------------------------- projects */

describe('project creation', () => {
  it('sizes exterior walls so the inner face matches the requested footprint', () => {
    // Dimensions are feet, always.
    const p = createProject({ name: 'X', width: 30, height: 20, unit: 'ft', outerWalls: true });
    const rooms = Object.values(p.entities).filter((e) => e.type === 'room');
    expect(rooms).toHaveLength(1);
    if (rooms[0].type === 'room') {
      // The detected room follows the wall centrelines, so it is one wall
      // thickness larger than the clear inside dimension in each direction.
      const t = p.wallDefaults.exteriorThickness;
      const area = polygonArea(rooms[0].polygon);
      expect(area).toBeCloseTo((mmOfFeet(30) + t) * (mmOfFeet(20) + t), -5);
    }
  });

  it('always creates a plot, even with no walls', () => {
    const p = createProject({ name: 'X', width: 30, height: 20, unit: 'ft', outerWalls: false });
    // The plot is the one thing every plan has: it is what everything snaps to.
    expect(p.order).toHaveLength(1);
    const plot = findPlot(p);
    expect(plot).not.toBeNull();
    expect(feetOf(plot!.width)).toBeCloseTo(30 + feetOf(p.wallDefaults.exteriorThickness), 6);
    expect(p.layers.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ DXF */

describe('DXF export', () => {
  it('emits a well-formed R12 document with layers and geometry', () => {
    const p = createProject({ name: 'X', width: 6, height: 4, unit: 'm', outerWalls: true });
    const dxf = toDXF(p);
    expect(dxf).toContain('AC1009');
    expect(dxf).toContain('SECTION');
    expect(dxf.trimEnd().endsWith('EOF')).toBe(true);
    expect(dxf).toContain('A-WALL');
    expect(dxf).toContain('POLYLINE');
    // Group codes and values must pair up exactly. Values may legitimately be
    // empty (the STYLE table has one), so only the trailing terminator is cut.
    const lines = dxf.split('\r\n');
    lines.pop();
    expect(lines.length % 2).toBe(0);
    for (let i = 0; i < lines.length; i += 2) {
      expect(lines[i]).toMatch(/^\d+$/);
    }
  });

  it('flips Y into DXF world orientation', () => {
    const p = projectWith([makeWall(0, 1000, 1000, 1000)]);
    const dxf = toDXF(p);
    // Our +y is downward, so a wall at y=1000 lands at -1000 in DXF.
    expect(dxf).toContain('-1000');
  });
});

/* ---------------------------------------------------------------- scale */

describe('drawing scale', () => {
  it('reports world mm per paper mm', () => {
    // 1 mm of building drawn across 1 mm of paper is 1:1.
    expect(scaleDenominator(1 / MM_PER_CSS_PX)).toBeCloseTo(1, 6);
    // A metre of building across a centimetre of paper is 1:100.
    const pxPerMM = 10 / MM_PER_CSS_PX / 1000;
    expect(scaleDenominator(pxPerMM)).toBeCloseTo(100, 6);
  });

  it('gives a plausible architectural scale for a real sheet', () => {
    // A 12.2 m plan fitted across ~1780 px of an A3-ish sheet.
    const pxPerMM = 1780 / 12200;
    const denom = scaleDenominator(pxPerMM);
    expect(denom).toBeGreaterThan(20);
    expect(denom).toBeLessThan(40);
  });

  it('never returns a nonsensical value', () => {
    expect(scaleDenominator(0)).toBe(1);
    expect(scaleDenominator(-1)).toBe(1);
    expect(scaleDenominator(Number.NaN)).toBe(1);
  });
});

/* -------------------------------------------------------------- room box */

describe('room boxes', () => {
  const base = () => createProject({ name: 'T', width: 40, height: 30, unit: 'ft', outerWalls: false });

  it('builds a room whose clear size is exactly what was asked for', () => {
    const p = base();
    const rect = { x: 0, y: 0, w: mmOfFeet(12), h: mmOfFeet(10) };
    const { room, walls } = buildRoomBox(p, {
      rect,
      wallThickness: 100,
      wallHeight: 2743,
    });
    expect(walls).toHaveLength(4);
    expect(room.wallIds).toHaveLength(4);
    const r = roomRect(room)!;
    expect(r.w).toBeCloseTo(rect.w, 6);
    expect(r.h).toBeCloseTo(rect.h, 6);
    expect(sqftOf(polygonArea(room.polygon))).toBeCloseTo(120, 6);
  });

  it('resizes a room and moves its walls with it', () => {
    let p = base();
    const { room, walls } = buildRoomBox(p, {
      rect: { x: 0, y: 0, w: mmOfFeet(12), h: mmOfFeet(10) },
      wallThickness: 100,
      wallHeight: 2743,
    });
    for (const e of [...walls, room]) {
      p.entities[e.id] = e;
      p.order.push(e.id);
    }

    p = resizeRoomBox(p, room.id, { w: mmOfFeet(20) });
    const r = roomRect(p.entities[room.id] as never)!;
    expect(feetOf(r.w)).toBeCloseTo(20, 6);
    // The top-left corner is the anchor, so the room grew rightwards.
    expect(r.x).toBeCloseTo(0, 6);

    // The east wall must have followed the new width.
    const east = p.entities[room.wallIds![1]];
    expect(east.type).toBe('wall');
    if (east.type === 'wall') expect(feetOf(east.a.x)).toBeCloseTo(20 + 50 / 304.8, 3);
  });

  it('resizes to a target area while holding proportions', () => {
    let p = base();
    const { room, walls } = buildRoomBox(p, {
      rect: { x: 0, y: 0, w: mmOfFeet(12), h: mmOfFeet(10) },
      wallThickness: 100,
      wallHeight: 2743,
    });
    for (const e of [...walls, room]) {
      p.entities[e.id] = e;
      p.order.push(e.id);
    }

    p = setRoomArea(p, room.id, mm2OfSqft(240));
    const r = roomRect(p.entities[room.id] as never)!;
    expect(sqftOf(r.w * r.h)).toBeCloseTo(240, 3);
    // Doubling the area keeps the 12:10 proportion.
    expect(r.w / r.h).toBeCloseTo(1.2, 6);
  });

  it('keeps rooms inside the plot', () => {
    const p = createProject({ name: 'T', width: 40, height: 30, unit: 'ft', outerWalls: true });
    const plot = findPlot(p)!;
    expect(plot).toBeTruthy();
    const outside = { x: plot.x + plot.width - 500, y: plot.y, w: mmOfFeet(20), h: mmOfFeet(10) };
    const clamped = clampRectToPlot(outside, plot);
    expect(clamped.x + clamped.w).toBeLessThanOrEqual(plot.x + plot.width + 1e-6);
    expect(clamped.w).toBeCloseTo(outside.w, 6); // slid in, not shrunk
  });

  it('recognises only true rectangles', () => {
    const p = base();
    const { room } = buildRoomBox(p, {
      rect: { x: 0, y: 0, w: 1000, h: 1000 },
      wallThickness: 100,
      wallHeight: 2743,
    });
    expect(roomRect(room)).not.toBeNull();
    const L = { ...room, polygon: [...room.polygon, { x: 500, y: 1500 }] };
    expect(roomRect(L)).toBeNull();
  });
});
