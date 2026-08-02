import type { Unit } from '@/types';

/**
 * Everything in this application is displayed in **feet**.
 *
 * Geometry is still stored in millimetres — that is what keeps arithmetic exact
 * and avoids float drift — but the presentation layer speaks one unit and one
 * unit only, so a plan never mixes notations.
 */

export const MM_PER_FT = 304.8;
export const MM_PER_IN = 25.4;

/** Retained so older saved files that name a unit still load. */
export const MM_PER_UNIT: Record<Unit, number> = {
  ft: MM_PER_FT,
  in: MM_PER_IN,
  m: 1000,
  cm: 10,
};

export const UNIT_LABEL: Record<Unit, string> = { ft: 'ft', in: 'in', m: 'm', cm: 'cm' };

export const toMM = (value: number, _unit?: Unit): number => value * MM_PER_FT;
export const fromMM = (mm: number, _unit?: Unit): number => mm / MM_PER_FT;

export const feetOf = (mm: number): number => mm / MM_PER_FT;
export const mmOfFeet = (ft: number): number => ft * MM_PER_FT;

/**
 * Format a length in feet.
 *
 * Short runs get two decimals so a 6" jamb still reads as 0.5'; longer ones get
 * one, because a tenth of a foot is already finer than anything drawn at plan
 * scale.
 */
export function formatLength(mm: number, _unit?: Unit, opts?: { compact?: boolean }): string {
  const ft = mm / MM_PER_FT;
  const abs = Math.abs(ft);
  const decimals = opts?.compact ? (abs < 10 ? 1 : 0) : abs < 10 ? 2 : 1;
  return `${trim(ft, decimals)}'`;
}

/** Bare number of feet, for input fields that render their own unit. */
export function formatFeetValue(mm: number, decimals = 2): string {
  return trim(mm / MM_PER_FT, decimals);
}

/** Area is always square feet. */
export function formatArea(mm2: number, _unit?: Unit): string {
  const sqft = mm2 / (MM_PER_FT * MM_PER_FT);
  return `${trim(sqft, sqft < 100 ? 1 : 0)} ft²`;
}

export const sqftOf = (mm2: number): number => mm2 / (MM_PER_FT * MM_PER_FT);
export const mm2OfSqft = (sqft: number): number => sqft * MM_PER_FT * MM_PER_FT;

export function formatAngle(radians: number): string {
  let deg = (radians * 180) / Math.PI;
  deg = ((deg % 360) + 360) % 360;
  return `${trim(deg, 1)}°`;
}

/**
 * Parse a typed length into millimetres.
 *
 * A bare number is feet, because that is the project unit. Feet-and-inches
 * (`12'6"`) and plain inches (`18in`) are still accepted so a user who thinks
 * in inches for a door width is not forced to convert in their head.
 */
export function parseLength(input: string, _unit?: Unit): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return null;

  // 12'6"  /  12' 6 1/2"  /  12'
  const ftIn = s.match(/^(-?[\d.]+)\s*(?:'|ft|feet)\s*(?:(\d+(?:\.\d+)?)?\s*(?:(\d+)\/(\d+))?\s*(?:"|in|inch(?:es)?)?)?$/);
  if (ftIn) {
    const feet = Number(ftIn[1]);
    if (!Number.isFinite(feet)) return null;
    const inches = ftIn[2] ? Number(ftIn[2]) : 0;
    const frac = ftIn[3] && ftIn[4] ? Number(ftIn[3]) / Number(ftIn[4]) : 0;
    const sign = feet < 0 ? -1 : 1;
    return (Math.abs(feet) * MM_PER_FT + (inches + frac) * MM_PER_IN) * sign;
  }

  // Inches only.
  const inOnly = s.match(/^(-?[\d.]+)\s*(?:"|in|inch(?:es)?)$/);
  if (inOnly) {
    const v = Number(inOnly[1]);
    return Number.isFinite(v) ? v * MM_PER_IN : null;
  }

  // Metric, tolerated on input and immediately converted.
  const metric = s.match(/^(-?[\d.]+)\s*(mm|cm|m)$/);
  if (metric) {
    const v = Number(metric[1]);
    if (!Number.isFinite(v)) return null;
    return metric[2] === 'mm' ? v : metric[2] === 'cm' ? v * 10 : v * 1000;
  }

  const bare = Number(s);
  return Number.isFinite(bare) ? bare * MM_PER_FT : null;
}

/** Parse an area typed in square feet. */
export function parseArea(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/(sq\.?\s*ft|ft2|ft²|sqft)$/, '').trim();
  const v = Number(s);
  return Number.isFinite(v) && v > 0 ? mm2OfSqft(v) : null;
}

function trim(n: number, decimals: number): string {
  const s = n.toFixed(Math.max(0, decimals));
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/**
 * A grid spacing in mm that reads well at the given zoom — 6", 1', 5', 10'…
 * so grid lines never crowd together.
 */
export function niceGridStep(_unit: Unit | undefined, minScreenPx: number, pxPerMM: number): number {
  const targetMM = minScreenPx / pxPerMM;
  const ladder = [
    MM_PER_IN * 6,
    MM_PER_FT,
    MM_PER_FT * 2,
    MM_PER_FT * 5,
    MM_PER_FT * 10,
    MM_PER_FT * 20,
    MM_PER_FT * 50,
    MM_PER_FT * 100,
    MM_PER_FT * 200,
  ];
  for (const step of ladder) if (step >= targetMM) return step;
  return ladder[ladder.length - 1];
}
