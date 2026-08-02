import type { FurnitureCategory } from '@/types';

/**
 * A furniture symbol.
 *
 * `draw` receives a context already translated to the item's centre, rotated,
 * flipped, and scaled so that 1 unit = 1 mm. Symbols therefore draw in real
 * dimensions and stay correct at any zoom. Stroke widths are set by the caller
 * (in mm) so lines stay hairline-thin on screen.
 */
export interface CatalogItem {
  id: string;
  name: string;
  category: FurnitureCategory;
  /** Default size in mm. */
  width: number;
  depth: number;
  /** Layer this item belongs on — services items go on their own layers. */
  layerKind?: 'furniture' | 'electrical' | 'plumbing' | 'hvac';
  keywords?: string[];
  draw: (ctx: CanvasRenderingContext2D, w: number, d: number) => void;
}

/* ------------------------------------------------------------- primitives */

const rect = (ctx: CanvasRenderingContext2D, w: number, d: number, r = 0) => {
  ctx.beginPath();
  if (r > 0) ctx.roundRect(-w / 2, -d / 2, w, d, r);
  else ctx.rect(-w / 2, -d / 2, w, d);
};

const box = (ctx: CanvasRenderingContext2D, w: number, d: number, r = 0) => {
  rect(ctx, w, d, r);
  ctx.fill();
  ctx.stroke();
};

const line = (ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) => {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
};

const circle = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill = true) => {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  if (fill) ctx.fill();
  ctx.stroke();
};

const ellipse = (ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) => {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
};

/* ---------------------------------------------------------------- catalog */

export const CATALOG: CatalogItem[] = [
  /* ------------------------------------------------------------ bedroom */
  {
    id: 'bed-single',
    name: 'Single Bed',
    category: 'bedroom',
    width: 990,
    depth: 1900,
    keywords: ['bed', 'twin'],
    draw: (ctx, w, d) => {
      box(ctx, w, d, 40);
      // pillow
      ctx.beginPath();
      ctx.roundRect(-w / 2 + 60, -d / 2 + 60, w - 120, 300, 30);
      ctx.stroke();
      // duvet fold
      line(ctx, -w / 2, -d / 2 + 520, w / 2, -d / 2 + 520);
    },
  },
  {
    id: 'bed-double',
    name: 'Double Bed',
    category: 'bedroom',
    width: 1400,
    depth: 1900,
    keywords: ['bed', 'full'],
    draw: (ctx, w, d) => {
      box(ctx, w, d, 40);
      ctx.beginPath();
      ctx.roundRect(-w / 2 + 60, -d / 2 + 60, w / 2 - 90, 320, 30);
      ctx.stroke();
      ctx.beginPath();
      ctx.roundRect(30, -d / 2 + 60, w / 2 - 90, 320, 30);
      ctx.stroke();
      line(ctx, -w / 2, -d / 2 + 540, w / 2, -d / 2 + 540);
    },
  },
  {
    id: 'bed-queen',
    name: 'Queen Bed',
    category: 'bedroom',
    width: 1530,
    depth: 2030,
    keywords: ['bed'],
    draw: (ctx, w, d) => {
      box(ctx, w, d, 40);
      ctx.beginPath();
      ctx.roundRect(-w / 2 + 70, -d / 2 + 70, w / 2 - 100, 340, 30);
      ctx.stroke();
      ctx.beginPath();
      ctx.roundRect(30, -d / 2 + 70, w / 2 - 100, 340, 30);
      ctx.stroke();
      line(ctx, -w / 2, -d / 2 + 560, w / 2, -d / 2 + 560);
    },
  },
  {
    id: 'bed-king',
    name: 'King Bed',
    category: 'bedroom',
    width: 1930,
    depth: 2030,
    keywords: ['bed'],
    draw: (ctx, w, d) => {
      box(ctx, w, d, 40);
      ctx.beginPath();
      ctx.roundRect(-w / 2 + 80, -d / 2 + 70, w / 2 - 120, 360, 30);
      ctx.stroke();
      ctx.beginPath();
      ctx.roundRect(40, -d / 2 + 70, w / 2 - 120, 360, 30);
      ctx.stroke();
      line(ctx, -w / 2, -d / 2 + 580, w / 2, -d / 2 + 580);
    },
  },
  {
    id: 'nightstand',
    name: 'Nightstand',
    category: 'bedroom',
    width: 450,
    depth: 400,
    draw: (ctx, w, d) => {
      box(ctx, w, d, 20);
      line(ctx, -w / 2, 0, w / 2, 0);
    },
  },
  {
    id: 'wardrobe',
    name: 'Wardrobe',
    category: 'bedroom',
    width: 1800,
    depth: 600,
    keywords: ['closet', 'almirah'],
    draw: (ctx, w, d) => {
      box(ctx, w, d);
      line(ctx, 0, -d / 2, 0, d / 2);
      ctx.setLineDash([80, 60]);
      line(ctx, -w / 2, d / 2 - 60, w / 2, d / 2 - 60);
      ctx.setLineDash([]);
    },
  },
  {
    id: 'dresser',
    name: 'Dresser',
    category: 'bedroom',
    width: 1200,
    depth: 500,
    draw: (ctx, w, d) => {
      box(ctx, w, d);
      line(ctx, -w / 6, -d / 2, -w / 6, d / 2);
      line(ctx, w / 6, -d / 2, w / 6, d / 2);
    },
  },
  {
    id: 'crib',
    name: 'Crib',
    category: 'bedroom',
    width: 700,
    depth: 1300,
    draw: (ctx, w, d) => {
      box(ctx, w, d, 30);
      for (let i = 1; i < 5; i++) line(ctx, -w / 2, -d / 2 + (d / 5) * i, w / 2, -d / 2 + (d / 5) * i);
    },
  },

  /* ------------------------------------------------------------- living */
  {
    id: 'sofa-3',
    name: 'Sofa (3-seat)',
    category: 'living',
    width: 2100,
    depth: 900,
    keywords: ['couch', 'settee'],
    draw: (ctx, w, d) => {
      box(ctx, w, d, 60);
      // back
      ctx.beginPath();
      ctx.roundRect(-w / 2, -d / 2, w, 180, 40);
      ctx.stroke();
      // arms
      ctx.beginPath();
      ctx.roundRect(-w / 2, -d / 2, 180, d, 40);
      ctx.stroke();
      ctx.beginPath();
      ctx.roundRect(w / 2 - 180, -d / 2, 180, d, 40);
      ctx.stroke();
      // cushion splits
      line(ctx, -w / 6, -d / 2 + 180, -w / 6, d / 2);
      line(ctx, w / 6, -d / 2 + 180, w / 6, d / 2);
    },
  },
  {
    id: 'sofa-2',
    name: 'Loveseat',
    category: 'living',
    width: 1500,
    depth: 900,
    draw: (ctx, w, d) => {
      box(ctx, w, d, 60);
      ctx.beginPath();
      ctx.roundRect(-w / 2, -d / 2, w, 180, 40);
      ctx.stroke();
      line(ctx, 0, -d / 2 + 180, 0, d / 2);
    },
  },
  {
    id: 'armchair',
    name: 'Armchair',
    category: 'living',
    width: 850,
    depth: 850,
    draw: (ctx, w, d) => {
      box(ctx, w, d, 60);
      ctx.beginPath();
      ctx.roundRect(-w / 2, -d / 2, w, 160, 40);
      ctx.stroke();
    },
  },
  {
    id: 'coffee-table',
    name: 'Coffee Table',
    category: 'living',
    width: 1200,
    depth: 600,
    draw: (ctx, w, d) => box(ctx, w, d, 40),
  },
  {
    id: 'tv-unit',
    name: 'TV Unit',
    category: 'living',
    width: 1800,
    depth: 400,
    keywords: ['media', 'console'],
    draw: (ctx, w, d) => {
      box(ctx, w, d);
      line(ctx, -w / 2 + 100, -d / 2 + 80, w / 2 - 100, -d / 2 + 80);
    },
  },
  {
    id: 'rug',
    name: 'Area Rug',
    category: 'decor',
    width: 2400,
    depth: 1700,
    draw: (ctx, w, d) => {
      box(ctx, w, d, 20);
      ctx.setLineDash([60, 50]);
      rect(ctx, w - 200, d - 200, 10);
      ctx.stroke();
      ctx.setLineDash([]);
    },
  },
  {
    id: 'bookshelf',
    name: 'Bookshelf',
    category: 'storage',
    width: 900,
    depth: 320,
    draw: (ctx, w, d) => {
      box(ctx, w, d);
      line(ctx, -w / 6, -d / 2, -w / 6, d / 2);
      line(ctx, w / 6, -d / 2, w / 6, d / 2);
    },
  },
  {
    id: 'piano',
    name: 'Upright Piano',
    category: 'living',
    width: 1500,
    depth: 650,
    draw: (ctx, w, d) => {
      box(ctx, w, d, 20);
      line(ctx, -w / 2, d / 2 - 200, w / 2, d / 2 - 200);
      for (let x = -w / 2 + 100; x < w / 2 - 100; x += 90) line(ctx, x, d / 2 - 200, x, d / 2);
    },
  },

  /* ------------------------------------------------------------ kitchen */
  {
    id: 'counter',
    name: 'Counter Run',
    category: 'kitchen',
    width: 2400,
    depth: 600,
    keywords: ['cabinet', 'worktop'],
    draw: (ctx, w, d) => {
      box(ctx, w, d);
      ctx.setLineDash([70, 50]);
      line(ctx, -w / 2, d / 2 - 100, w / 2, d / 2 - 100);
      ctx.setLineDash([]);
    },
  },
  {
    id: 'island',
    name: 'Kitchen Island',
    category: 'kitchen',
    width: 1800,
    depth: 900,
    draw: (ctx, w, d) => {
      box(ctx, w, d, 20);
      rect(ctx, w - 160, d - 160, 10);
      ctx.stroke();
    },
  },
  {
    id: 'sink-kitchen',
    name: 'Kitchen Sink',
    category: 'kitchen',
    width: 800,
    depth: 500,
    layerKind: 'plumbing',
    draw: (ctx, w, d) => {
      box(ctx, w, d, 20);
      ctx.beginPath();
      ctx.roundRect(-w / 2 + 60, -d / 2 + 90, w - 120, d - 150, 40);
      ctx.stroke();
      circle(ctx, 0, -d / 2 + 45, 40, false);
    },
  },
  {
    id: 'cooktop',
    name: 'Cooktop',
    category: 'kitchen',
    width: 760,
    depth: 560,
    keywords: ['hob', 'stove'],
    draw: (ctx, w, d) => {
      box(ctx, w, d, 20);
      const r = Math.min(w, d) / 5.5;
      circle(ctx, -w / 4, -d / 4, r, false);
      circle(ctx, w / 4, -d / 4, r, false);
      circle(ctx, -w / 4, d / 4, r, false);
      circle(ctx, w / 4, d / 4, r, false);
    },
  },
  {
    id: 'oven',
    name: 'Oven',
    category: 'kitchen',
    width: 600,
    depth: 600,
    draw: (ctx, w, d) => {
      box(ctx, w, d);
      rect(ctx, w - 140, d - 220, 20);
      ctx.stroke();
    },
  },
  {
    id: 'fridge',
    name: 'Refrigerator',
    category: 'kitchen',
    width: 900,
    depth: 700,
    draw: (ctx, w, d) => {
      box(ctx, w, d, 20);
      line(ctx, 0, -d / 2, 0, d / 2);
      ctx.setLineDash([60, 40]);
      line(ctx, -w / 2, d / 2 - 80, w / 2, d / 2 - 80);
      ctx.setLineDash([]);
    },
  },
  {
    id: 'dishwasher',
    name: 'Dishwasher',
    category: 'kitchen',
    width: 600,
    depth: 600,
    layerKind: 'plumbing',
    draw: (ctx, w, d) => {
      box(ctx, w, d);
      rect(ctx, w - 120, d - 160, 10);
      ctx.stroke();
    },
  },
  {
    id: 'pantry',
    name: 'Pantry',
    category: 'storage',
    width: 900,
    depth: 600,
    draw: (ctx, w, d) => {
      box(ctx, w, d);
      line(ctx, -w / 2, -d / 2, w / 2, d / 2);
      line(ctx, -w / 2, d / 2, w / 2, -d / 2);
    },
  },

  /* ----------------------------------------------------------- bathroom */
  {
    id: 'wc',
    name: 'Toilet',
    category: 'bathroom',
    width: 400,
    depth: 700,
    layerKind: 'plumbing',
    keywords: ['wc', 'water closet'],
    draw: (ctx, w, d) => {
      // cistern
      ctx.beginPath();
      ctx.rect(-w / 2, -d / 2, w, 180);
      ctx.fill();
      ctx.stroke();
      // bowl
      ellipse(ctx, 0, -d / 2 + 180 + (d - 180) / 2, w / 2 - 20, (d - 180) / 2 - 20);
    },
  },
  {
    id: 'sink-bath',
    name: 'Washbasin',
    category: 'bathroom',
    width: 600,
    depth: 450,
    layerKind: 'plumbing',
    draw: (ctx, w, d) => {
      box(ctx, w, d, 30);
      ellipse(ctx, 0, 20, w / 2 - 70, d / 2 - 80);
      circle(ctx, 0, -d / 2 + 60, 35, false);
    },
  },
  {
    id: 'bathtub',
    name: 'Bathtub',
    category: 'bathroom',
    width: 1700,
    depth: 750,
    layerKind: 'plumbing',
    draw: (ctx, w, d) => {
      box(ctx, w, d, 60);
      ctx.beginPath();
      ctx.roundRect(-w / 2 + 70, -d / 2 + 70, w - 200, d - 140, 100);
      ctx.stroke();
      circle(ctx, w / 2 - 200, 0, 40, false);
    },
  },
  {
    id: 'shower',
    name: 'Shower',
    category: 'bathroom',
    width: 900,
    depth: 900,
    layerKind: 'plumbing',
    draw: (ctx, w, d) => {
      box(ctx, w, d);
      line(ctx, -w / 2, -d / 2, w / 2, d / 2);
      line(ctx, -w / 2, d / 2, w / 2, -d / 2);
      circle(ctx, 0, 0, 60, false);
    },
  },
  {
    id: 'washer',
    name: 'Washing Machine',
    category: 'plumbing',
    width: 600,
    depth: 600,
    layerKind: 'plumbing',
    draw: (ctx, w, d) => {
      box(ctx, w, d, 20);
      circle(ctx, 0, 0, Math.min(w, d) / 3, false);
    },
  },

  /* ------------------------------------------------------------- dining */
  {
    id: 'dining-4',
    name: 'Dining Table (4)',
    category: 'dining',
    width: 1200,
    depth: 800,
    draw: (ctx, w, d) => {
      box(ctx, w, d, 30);
      chair(ctx, 0, -d / 2 - 260, 0);
      chair(ctx, 0, d / 2 + 260, Math.PI);
      chair(ctx, -w / 2 - 260, 0, Math.PI / 2);
      chair(ctx, w / 2 + 260, 0, -Math.PI / 2);
    },
  },
  {
    id: 'dining-6',
    name: 'Dining Table (6)',
    category: 'dining',
    width: 1800,
    depth: 900,
    draw: (ctx, w, d) => {
      box(ctx, w, d, 30);
      for (const x of [-w / 4, 0, w / 4]) {
        chair(ctx, x, -d / 2 - 260, 0);
        chair(ctx, x, d / 2 + 260, Math.PI);
      }
    },
  },
  {
    id: 'dining-round',
    name: 'Round Table',
    category: 'dining',
    width: 1200,
    depth: 1200,
    draw: (ctx, w) => {
      circle(ctx, 0, 0, w / 2);
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        chair(ctx, Math.cos(a) * (w / 2 + 260), Math.sin(a) * (w / 2 + 260), a - Math.PI / 2);
      }
    },
  },
  {
    id: 'chair',
    name: 'Chair',
    category: 'dining',
    width: 450,
    depth: 450,
    draw: (ctx, w, d) => {
      box(ctx, w, d, 30);
      line(ctx, -w / 2, -d / 2 + 70, w / 2, -d / 2 + 70);
    },
  },
  {
    id: 'bar-stool',
    name: 'Bar Stool',
    category: 'dining',
    width: 400,
    depth: 400,
    draw: (ctx, w) => circle(ctx, 0, 0, w / 2),
  },

  /* ------------------------------------------------------------- office */
  {
    id: 'desk',
    name: 'Desk',
    category: 'office',
    width: 1400,
    depth: 700,
    draw: (ctx, w, d) => {
      box(ctx, w, d, 20);
      chair(ctx, 0, d / 2 + 300, Math.PI);
    },
  },
  {
    id: 'desk-l',
    name: 'L-Desk',
    category: 'office',
    width: 1600,
    depth: 1600,
    draw: (ctx, w, d) => {
      ctx.beginPath();
      ctx.moveTo(-w / 2, -d / 2);
      ctx.lineTo(w / 2, -d / 2);
      ctx.lineTo(w / 2, -d / 2 + 700);
      ctx.lineTo(-w / 2 + 700, -d / 2 + 700);
      ctx.lineTo(-w / 2 + 700, d / 2);
      ctx.lineTo(-w / 2, d / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    },
  },
  {
    id: 'office-chair',
    name: 'Office Chair',
    category: 'office',
    width: 600,
    depth: 600,
    draw: (ctx, w, d) => {
      circle(ctx, 0, 0, Math.min(w, d) / 2 - 40);
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(w, d) / 2, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    },
  },
  {
    id: 'filing-cabinet',
    name: 'Filing Cabinet',
    category: 'storage',
    width: 450,
    depth: 600,
    draw: (ctx, w, d) => {
      box(ctx, w, d);
      line(ctx, -w / 2, -d / 6, w / 2, -d / 6);
      line(ctx, -w / 2, d / 6, w / 2, d / 6);
    },
  },

  /* ------------------------------------------------------------ outdoor */
  {
    id: 'patio-set',
    name: 'Patio Set',
    category: 'outdoor',
    width: 1400,
    depth: 1400,
    draw: (ctx, w) => {
      circle(ctx, 0, 0, 450);
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + Math.PI / 4;
        chair(ctx, Math.cos(a) * (w / 2 - 250), Math.sin(a) * (w / 2 - 250), a - Math.PI / 2);
      }
    },
  },
  {
    id: 'planter',
    name: 'Planter',
    category: 'outdoor',
    width: 500,
    depth: 500,
    draw: (ctx, w) => {
      circle(ctx, 0, 0, w / 2);
      circle(ctx, 0, 0, w / 3, false);
    },
  },
  {
    id: 'tree',
    name: 'Tree',
    category: 'outdoor',
    width: 2000,
    depth: 2000,
    draw: (ctx, w) => {
      const r = w / 2;
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const rr = r * (i % 2 === 0 ? 1 : 0.82);
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      circle(ctx, 0, 0, r / 6, false);
    },
  },
  {
    id: 'car',
    name: 'Car',
    category: 'outdoor',
    width: 1800,
    depth: 4500,
    keywords: ['parking', 'garage'],
    draw: (ctx, w, d) => {
      box(ctx, w, d, 200);
      ctx.beginPath();
      ctx.roundRect(-w / 2 + 120, -d / 2 + 700, w - 240, d - 1900, 120);
      ctx.stroke();
    },
  },

  /* --------------------------------------------------------- electrical */
  {
    id: 'outlet',
    name: 'Power Outlet',
    category: 'electrical',
    width: 240,
    depth: 240,
    layerKind: 'electrical',
    keywords: ['socket', 'plug'],
    draw: (ctx, w) => {
      const r = w / 2;
      ctx.beginPath();
      ctx.arc(0, 0, r, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      line(ctx, -r, 0, r, 0);
      line(ctx, 0, 0, 0, -r * 1.4);
    },
  },
  {
    id: 'switch',
    name: 'Light Switch',
    category: 'electrical',
    width: 240,
    depth: 240,
    layerKind: 'electrical',
    draw: (ctx, w) => {
      const r = w / 2;
      circle(ctx, 0, 0, r * 0.5, false);
      line(ctx, r * 0.35, -r * 0.35, r, -r);
    },
  },
  {
    id: 'ceiling-light',
    name: 'Ceiling Light',
    category: 'electrical',
    width: 400,
    depth: 400,
    layerKind: 'electrical',
    draw: (ctx, w) => {
      const r = w / 2;
      circle(ctx, 0, 0, r * 0.55, false);
      line(ctx, -r, -r, r, r);
      line(ctx, -r, r, r, -r);
    },
  },
  {
    id: 'downlight',
    name: 'Downlight',
    category: 'electrical',
    width: 200,
    depth: 200,
    layerKind: 'electrical',
    draw: (ctx, w) => {
      circle(ctx, 0, 0, w / 2, false);
      circle(ctx, 0, 0, w / 4, false);
    },
  },
  {
    id: 'db-panel',
    name: 'Distribution Board',
    category: 'electrical',
    width: 400,
    depth: 150,
    layerKind: 'electrical',
    draw: (ctx, w, d) => {
      box(ctx, w, d);
      line(ctx, -w / 2, -d / 2, w / 2, d / 2);
    },
  },
  {
    id: 'data-point',
    name: 'Data Point',
    category: 'electrical',
    width: 240,
    depth: 240,
    layerKind: 'electrical',
    draw: (ctx, w) => {
      const r = w / 2;
      ctx.beginPath();
      ctx.arc(0, 0, r, Math.PI, 0);
      ctx.closePath();
      ctx.stroke();
      ctx.font = `${r}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('TV', 0, -r * 0.2);
    },
  },

  /* --------------------------------------------------------------- hvac */
  {
    id: 'ac-split',
    name: 'Split AC',
    category: 'hvac',
    width: 900,
    depth: 220,
    layerKind: 'hvac',
    draw: (ctx, w, d) => {
      box(ctx, w, d, 40);
      line(ctx, -w / 2 + 60, 0, w / 2 - 60, 0);
    },
  },
  {
    id: 'ac-cassette',
    name: 'Cassette AC',
    category: 'hvac',
    width: 840,
    depth: 840,
    layerKind: 'hvac',
    draw: (ctx, w, d) => {
      box(ctx, w, d);
      rect(ctx, w - 200, d - 200);
      ctx.stroke();
    },
  },
  {
    id: 'vent',
    name: 'Supply Vent',
    category: 'hvac',
    width: 400,
    depth: 200,
    layerKind: 'hvac',
    draw: (ctx, w, d) => {
      box(ctx, w, d);
      for (let i = 1; i < 4; i++) line(ctx, -w / 2 + (w / 4) * i, -d / 2, -w / 2 + (w / 4) * i, d / 2);
    },
  },
  {
    id: 'ceiling-fan',
    name: 'Ceiling Fan',
    category: 'hvac',
    width: 1200,
    depth: 1200,
    layerKind: 'hvac',
    draw: (ctx, w) => {
      const r = w / 2;
      circle(ctx, 0, 0, r * 0.15, false);
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        ctx.save();
        ctx.rotate(a);
        ctx.beginPath();
        ctx.ellipse(r * 0.55, 0, r * 0.45, r * 0.12, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    },
  },
  {
    id: 'water-heater',
    name: 'Water Heater',
    category: 'plumbing',
    width: 450,
    depth: 450,
    layerKind: 'plumbing',
    draw: (ctx, w) => {
      circle(ctx, 0, 0, w / 2);
      ctx.font = `${w / 3}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('WH', 0, w / 9);
    },
  },
  {
    id: 'floor-drain',
    name: 'Floor Drain',
    category: 'plumbing',
    width: 150,
    depth: 150,
    layerKind: 'plumbing',
    draw: (ctx, w) => {
      box(ctx, w, w);
      line(ctx, -w / 2, -w / 2, w / 2, w / 2);
      line(ctx, -w / 2, w / 2, w / 2, -w / 2);
    },
  },

  /* -------------------------------------------------------------- decor */
  {
    id: 'plant',
    name: 'Indoor Plant',
    category: 'decor',
    width: 500,
    depth: 500,
    draw: (ctx, w) => {
      const r = w / 2;
      ctx.beginPath();
      for (let i = 0; i <= 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const rr = r * (i % 2 === 0 ? 1 : 0.7);
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    },
  },
  {
    id: 'mirror',
    name: 'Mirror',
    category: 'decor',
    width: 900,
    depth: 60,
    draw: (ctx, w, d) => {
      box(ctx, w, d);
      ctx.setLineDash([50, 40]);
      line(ctx, -w / 2, 0, w / 2, 0);
      ctx.setLineDash([]);
    },
  },
  {
    id: 'stairs',
    name: 'Stairs',
    category: 'storage',
    width: 1000,
    depth: 3000,
    keywords: ['staircase', 'steps'],
    draw: (ctx, w, d) => {
      box(ctx, w, d);
      const treads = Math.max(2, Math.round(d / 280));
      for (let i = 1; i < treads; i++) {
        line(ctx, -w / 2, -d / 2 + (d / treads) * i, w / 2, -d / 2 + (d / treads) * i);
      }
      // direction arrow
      ctx.beginPath();
      ctx.moveTo(0, d / 2 - 120);
      ctx.lineTo(0, -d / 2 + 120);
      ctx.moveTo(-100, -d / 2 + 300);
      ctx.lineTo(0, -d / 2 + 120);
      ctx.lineTo(100, -d / 2 + 300);
      ctx.stroke();
    },
  },
  {
    id: 'column',
    name: 'Column',
    category: 'storage',
    width: 300,
    depth: 300,
    draw: (ctx, w, d) => {
      box(ctx, w, d);
      line(ctx, -w / 2, -d / 2, w / 2, d / 2);
      line(ctx, -w / 2, d / 2, w / 2, -d / 2);
    },
  },
];

function chair(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.roundRect(-225, -225, 450, 450, 30);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-225, -155);
  ctx.lineTo(225, -155);
  ctx.stroke();
  ctx.restore();
}

export const CATALOG_BY_ID = new Map(CATALOG.map((c) => [c.id, c]));

export const CATEGORIES: Array<{ id: FurnitureCategory; label: string }> = [
  { id: 'bedroom', label: 'Bedroom' },
  { id: 'living', label: 'Living' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'bathroom', label: 'Bathroom' },
  { id: 'dining', label: 'Dining' },
  { id: 'office', label: 'Office' },
  { id: 'outdoor', label: 'Outdoor' },
  { id: 'electrical', label: 'Electrical' },
  { id: 'hvac', label: 'HVAC' },
  { id: 'plumbing', label: 'Plumbing' },
  { id: 'decor', label: 'Decor' },
  { id: 'storage', label: 'Storage' },
];

export function searchCatalog(query: string): CatalogItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return CATALOG;
  return CATALOG.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.category.includes(q) ||
      (c.keywords ?? []).some((k) => k.includes(q)),
  );
}
