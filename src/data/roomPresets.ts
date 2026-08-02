import type { RoomType } from '@/types';
import { MM_PER_FT } from '@/core/units';

/**
 * Ready-made rooms.
 *
 * Sizes are typical Indian/US residential clear internal dimensions in feet,
 * so dropping one in gives a plausible starting point that the user then tunes
 * numerically rather than a placeholder they must resize from scratch.
 */
export interface RoomPreset {
  id: string;
  name: string;
  roomType: RoomType;
  /** Clear internal size in feet. */
  wFt: number;
  hFt: number;
  group: 'Living' | 'Sleeping' | 'Service' | 'Circulation' | 'Outdoor';
}

export const ROOM_PRESETS: RoomPreset[] = [
  // Living
  { id: 'living', name: 'Living Room', roomType: 'living', wFt: 16, hFt: 14, group: 'Living' },
  { id: 'family', name: 'Family Room', roomType: 'living', wFt: 14, hFt: 12, group: 'Living' },
  { id: 'dining', name: 'Dining', roomType: 'dining', wFt: 12, hFt: 10, group: 'Living' },
  { id: 'kitchen', name: 'Kitchen', roomType: 'kitchen', wFt: 12, hFt: 9, group: 'Living' },
  { id: 'kitchen-small', name: 'Kitchenette', roomType: 'kitchen', wFt: 8, hFt: 7, group: 'Living' },
  { id: 'study', name: 'Study', roomType: 'office', wFt: 10, hFt: 9, group: 'Living' },
  { id: 'office', name: 'Home Office', roomType: 'office', wFt: 11, hFt: 10, group: 'Living' },
  { id: 'puja', name: 'Puja Room', roomType: 'other', wFt: 6, hFt: 5, group: 'Living' },

  // Sleeping
  { id: 'master', name: 'Master Bedroom', roomType: 'bedroom', wFt: 14, hFt: 12, group: 'Sleeping' },
  { id: 'bedroom', name: 'Bedroom', roomType: 'bedroom', wFt: 12, hFt: 10, group: 'Sleeping' },
  { id: 'bedroom-small', name: 'Guest Bedroom', roomType: 'bedroom', wFt: 10, hFt: 10, group: 'Sleeping' },
  { id: 'kids', name: 'Kids Room', roomType: 'bedroom', wFt: 11, hFt: 10, group: 'Sleeping' },
  { id: 'dressing', name: 'Dressing Room', roomType: 'other', wFt: 8, hFt: 6, group: 'Sleeping' },
  { id: 'walkin', name: 'Walk-in Closet', roomType: 'other', wFt: 7, hFt: 5, group: 'Sleeping' },

  // Service
  { id: 'washroom', name: 'Washroom', roomType: 'bathroom', wFt: 8, hFt: 6, group: 'Service' },
  { id: 'bathroom', name: 'Bathroom', roomType: 'bathroom', wFt: 8, hFt: 7, group: 'Service' },
  { id: 'ensuite', name: 'En-suite Bath', roomType: 'bathroom', wFt: 9, hFt: 7, group: 'Service' },
  { id: 'powder', name: 'Powder Room', roomType: 'bathroom', wFt: 5, hFt: 4, group: 'Service' },
  { id: 'wc', name: 'WC', roomType: 'bathroom', wFt: 4, hFt: 4, group: 'Service' },
  { id: 'utility', name: 'Utility', roomType: 'utility', wFt: 8, hFt: 6, group: 'Service' },
  { id: 'laundry', name: 'Laundry', roomType: 'utility', wFt: 8, hFt: 7, group: 'Service' },
  { id: 'store', name: 'Store Room', roomType: 'utility', wFt: 7, hFt: 5, group: 'Service' },
  { id: 'pantry', name: 'Pantry', roomType: 'utility', wFt: 6, hFt: 5, group: 'Service' },
  { id: 'servant', name: 'Servant Room', roomType: 'bedroom', wFt: 8, hFt: 7, group: 'Service' },

  // Circulation
  { id: 'foyer', name: 'Foyer', roomType: 'hallway', wFt: 8, hFt: 6, group: 'Circulation' },
  { id: 'entrance', name: 'Entrance Lobby', roomType: 'hallway', wFt: 10, hFt: 7, group: 'Circulation' },
  { id: 'hallway', name: 'Hallway', roomType: 'hallway', wFt: 12, hFt: 4, group: 'Circulation' },
  { id: 'corridor', name: 'Corridor', roomType: 'hallway', wFt: 16, hFt: 3.5, group: 'Circulation' },
  { id: 'staircase', name: 'Staircase', roomType: 'other', wFt: 10, hFt: 4, group: 'Circulation' },
  { id: 'lift', name: 'Lift Lobby', roomType: 'other', wFt: 6, hFt: 6, group: 'Circulation' },

  // Outdoor
  { id: 'balcony', name: 'Balcony', roomType: 'balcony', wFt: 10, hFt: 5, group: 'Outdoor' },
  { id: 'terrace', name: 'Terrace', roomType: 'balcony', wFt: 14, hFt: 10, group: 'Outdoor' },
  { id: 'verandah', name: 'Verandah', roomType: 'balcony', wFt: 12, hFt: 7, group: 'Outdoor' },
  { id: 'garage', name: 'Garage', roomType: 'other', wFt: 18, hFt: 11, group: 'Outdoor' },
  { id: 'garden', name: 'Garden', roomType: 'balcony', wFt: 16, hFt: 12, group: 'Outdoor' },
];

export const PRESET_GROUPS: Array<RoomPreset['group']> = [
  'Living',
  'Sleeping',
  'Service',
  'Circulation',
  'Outdoor',
];

export const PRESET_BY_ID = new Map(ROOM_PRESETS.map((p) => [p.id, p]));

/** Preset size in millimetres. */
export function presetSizeMM(p: RoomPreset): { w: number; h: number } {
  return { w: p.wFt * MM_PER_FT, h: p.hFt * MM_PER_FT };
}

export function searchPresets(q: string): RoomPreset[] {
  const s = q.trim().toLowerCase();
  if (!s) return ROOM_PRESETS;
  return ROOM_PRESETS.filter(
    (p) => p.name.toLowerCase().includes(s) || p.roomType.includes(s) || p.group.toLowerCase().includes(s),
  );
}
