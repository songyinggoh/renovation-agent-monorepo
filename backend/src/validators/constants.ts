/**
 * Shared domain constants for closed-set validation.
 * Used by HTTP route validators and AI tool schemas.
 */

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
  // Short forms used in seed data
  'living',
  'dining',
  'basement',
] as const;

export type RoomType = (typeof ROOM_TYPES)[number];

/**
 * Style slugs are dynamic (from the catalog) so we constrain format only:
 * lowercase alphanumeric with hyphens, 1-100 chars.
 */
export const STYLE_SLUG_REGEX = /^[a-z0-9-]+$/;
