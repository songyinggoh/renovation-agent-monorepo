export const PRODUCT_CATEGORIES = [
  'flooring',
  'lighting',
  'furniture',
  'fixtures',
  'paint',
  'hardware',
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const ROOM_TYPES = [
  'kitchen',
  'bathroom',
  'bedroom',
  'living-room',
  'dining-room',
  'office',
  'outdoor',
  'garage',
  'laundry',
  'hallway',
  'living',
  'dining',
  'basement',
] as const;

export type RoomType = (typeof ROOM_TYPES)[number];

export const STYLE_SLUG_REGEX = /^[a-z0-9-]+$/;
