import type { Unit } from '@/types';

/** Millimetres per one of each supported unit. */
export const MM_PER_UNIT: Record<Unit, number> = {
  cm: 10,
  m: 1000,
  in: 25.4,
  ft: 304.8,
};

export const UNIT_LABEL: Record<Unit, string> = {
  ft: 'ft',
  in: 'in',
  m: 'm',
  cm: 'cm',
};

export function toMM(value: number, unit: Unit): number {
  return value * MM_PER_UNIT[unit];
}

export function fromMM(mm: number, unit: Unit): number {
  return mm / MM_PER_UNIT[unit];
}

/** Round to the nearest 1/16" — the finest fraction we display. */
const SIXTEENTH = 25.4 / 16;

/**
 * Format a millimetre length for display in the project's unit.
 *
 * Imperial output uses architectural notation (12' 6 1/2") because that is what
 * a builder expects to read off a plan; metric output uses decimals.
 */
export function formatLength(mm: number, unit: Unit, opts?: { compact?: boolean }): string {
  const compact = opts?.compact ?? false;
  if (unit === 'm') {
    const v = mm / 1000;
    return `${trim(v, v < 10 ? 3 : 2)} m`;
  }
  if (unit === 'cm') {
    return `${trim(mm / 10, 1)} cm`;
  }
  if (unit === 'in') {
    return `${formatInches(mm)}"`;
  }
  // feet + inches
  const negative = mm < 0;
  const total = Math.abs(mm);
  const totalSixteenths = Math.round(total / SIXTEENTH);
  const feet = Math.floor(totalSixteenths / (16 * 12));
  const remSixteenths = totalSixteenths - feet * 16 * 12;
  const inches = remSixteenths / 16;
  const sign = negative ? '-' : '';
  if (compact && inches === 0) return `${sign}${feet}'`;
  if (inches === 0) return `${sign}${feet}'-0"`;
  return `${sign}${feet}'-${formatInches(inches * 25.4)}"`;
}

function formatInches(mm: number): string {
  const totalSixteenths = Math.round(Math.abs(mm) / SIXTEENTH);
  const whole = Math.floor(totalSixteenths / 16);
  let num = totalSixteenths % 16;
  let den = 16;
  while (num > 0 && num % 2 === 0) {
    num /= 2;
    den /= 2;
  }
  const sign = mm < 0 ? '-' : '';
  if (num === 0) return `${sign}${whole}`;
  if (whole === 0) return `${sign}${num}/${den}`;
  return `${sign}${whole} ${num}/${den}`;
}

/** Format an area (mm²) as ft² or m² depending on the unit family. */
export function formatArea(mm2: number, unit: Unit): string {
  if (unit === 'ft' || unit === 'in') {
    const sqft = mm2 / (304.8 * 304.8);
    return `${trim(sqft, sqft < 100 ? 1 : 0)} ft²`;
  }
  const sqm = mm2 / 1_000_000;
  return `${trim(sqm, 2)} m²`;
}

export function formatAngle(radians: number): string {
  let deg = (radians * 180) / Math.PI;
  deg = ((deg % 360) + 360) % 360;
  return `${trim(deg, 1)}°`;
}

/**
 * Parse a user-typed length into millimetres. Accepts a bare number in the
 * project unit, or explicit notation: `12'6"`, `12' 6 1/2"`, `3.5m`, `450mm`.
 * Returns null when the text is not a length.
 */
export function parseLength(input: string, unit: Unit): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return null;

  // Explicit metric suffix.
  const metric = s.match(/^(-?[\d.]+)\s*(mm|cm|m)$/);
  if (metric) {
    const v = Number(metric[1]);
    if (!Number.isFinite(v)) return null;
    return metric[2] === 'mm' ? v : metric[2] === 'cm' ? v * 10 : v * 1000;
  }

  // Feet and/or inches, with optional fractions.
  const imperial = s.match(
    /^(?:(-?[\d.]+)\s*(?:'|ft|feet))?\s*(?:(-?\d+(?:\.\d+)?)?\s*(?:(\d+)\/(\d+))?\s*(?:"|in|inch(?:es)?))?$/,
  );
  if (imperial && (imperial[1] || imperial[2] || imperial[3])) {
    const feet = imperial[1] ? Number(imperial[1]) : 0;
    const inches = imperial[2] ? Number(imperial[2]) : 0;
    const frac = imperial[3] && imperial[4] ? Number(imperial[3]) / Number(imperial[4]) : 0;
    const sign = feet < 0 ? -1 : 1;
    return (Math.abs(feet) * 304.8 + (inches + frac) * 25.4) * sign;
  }

  const bare = Number(s);
  if (Number.isFinite(bare)) return toMM(bare, unit);
  return null;
}

function trim(n: number, decimals: number): string {
  const s = n.toFixed(decimals);
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/**
 * Pick a "nice" grid spacing in mm that reads well at the given zoom, so grid
 * lines never crowd together. Imperial steps follow 1"/6"/1'/5'/10'…, metric
 * follows a 1-2-5 decade ladder.
 */
export function niceGridStep(unit: Unit, minScreenPx: number, pxPerMM: number): number {
  const targetMM = minScreenPx / pxPerMM;
  const ladder =
    unit === 'ft' || unit === 'in'
      ? [25.4, 76.2, 152.4, 304.8, 914.4, 1524, 3048, 6096, 15240, 30480, 91440]
      : [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
  for (const step of ladder) if (step >= targetMM) return step;
  return ladder[ladder.length - 1];
}
