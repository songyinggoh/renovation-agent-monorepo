import { type SeedStyleManifest } from '../services/style-image.service.js';

/**
 * Curated style moodboard image manifest
 *
 * Images sourced from Unsplash (CC0 / free to use).
 * Each entry defines a reference image for a design style + room type.
 *
 * During seeding, these create DB records with sourceUrl references.
 * When Supabase Storage is configured, images can be downloaded and uploaded
 * to the style-assets bucket for self-hosted delivery.
 */
export const SEED_STYLE_IMAGES: SeedStyleManifest[] = [
  {
    styleSlug: 'modern-minimalist',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=800',
        filename: 'living-open-concept.jpg',
        roomType: 'living',
        caption: 'Open-concept minimalist living room with clean lines and neutral tones',
        altText: 'Minimalist living room with white walls, low-profile sofa, and natural light',
        tags: ['open-concept', 'neutral', 'natural-light', 'low-profile'],
      },
      {
        url: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800',
        filename: 'kitchen-white-marble.jpg',
        roomType: 'kitchen',
        caption: 'Sleek minimalist kitchen with marble countertops and handleless cabinets',
        altText: 'White kitchen with marble island, handleless cabinets, and pendant lighting',
        tags: ['marble', 'white', 'handleless', 'island'],
      },
      {
        url: 'https://images.unsplash.com/photo-1615529182904-14819c35db37?w=800',
        filename: 'bedroom-serene.jpg',
        roomType: 'bedroom',
        caption: 'Serene minimalist bedroom with platform bed and muted earth tones',
        altText: 'Minimalist bedroom with low platform bed, white bedding, and wooden accents',
        tags: ['platform-bed', 'serene', 'earth-tones', 'simple'],
      },
      {
        url: 'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=800',
        filename: 'bathroom-spa.jpg',
        roomType: 'bathroom',
        caption: 'Spa-like minimalist bathroom with floating vanity and freestanding tub',
        altText: 'Modern bathroom with concrete walls, floating vanity, and glass shower',
        tags: ['spa', 'floating-vanity', 'concrete', 'freestanding-tub'],
      },
      {
        url: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800',
        filename: 'office-clean.jpg',
        roomType: 'office',
        caption: 'Clean home office with built-in desk and minimal decor',
        altText: 'Minimalist home office with white desk, task chair, and single plant',
        tags: ['home-office', 'built-in', 'clean', 'functional'],
      },
    ],
  },
  {
    styleSlug: 'warm-scandinavian',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=800',
        filename: 'living-hygge.jpg',
        roomType: 'living',
        caption: 'Hygge living room with light wood, soft textiles, and warm lighting',
        altText: 'Scandinavian living room with birch furniture, wool throws, and candles',
        tags: ['hygge', 'light-wood', 'textiles', 'candles'],
      },
      {
        url: 'https://images.unsplash.com/photo-1556909114-44e3e70034e2?w=800',
        filename: 'kitchen-light-wood.jpg',
        roomType: 'kitchen',
        caption: 'Bright Scandinavian kitchen with pine cabinets and white tile backsplash',
        altText: 'Light wood kitchen with open shelving, white counters, and pendant lights',
        tags: ['pine', 'open-shelving', 'bright', 'white-tile'],
      },
      {
        url: 'https://images.unsplash.com/photo-1617325247661-675ab4b64ae2?w=800',
        filename: 'bedroom-cozy.jpg',
        roomType: 'bedroom',
        caption: 'Cozy Scandinavian bedroom with layered linens and natural textures',
        altText: 'Bedroom with linen bedding, sheepskin rug, wooden nightstands, and soft lighting',
        tags: ['linen', 'sheepskin', 'layered', 'cozy'],
      },
      {
        url: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800',
        filename: 'dining-warm.jpg',
        roomType: 'dining',
        caption: 'Warm Scandinavian dining area with oak table and ceramic tableware',
        altText: 'Dining room with long oak table, wishbone chairs, and hanging pendant',
        tags: ['oak', 'ceramic', 'wishbone-chairs', 'pendant'],
      },
      {
        url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800',
        filename: 'living-overview.jpg',
        roomType: 'living',
        caption: 'Open Scandinavian living space with muted palette and functional furniture',
        altText: 'Living room with cream sofa, natural rug, and minimal wall art',
        tags: ['muted', 'functional', 'cream', 'natural-rug'],
      },
    ],
  },
  {
    styleSlug: 'industrial-loft',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800',
        filename: 'living-exposed-brick.jpg',
        roomType: 'living',
        caption: 'Industrial loft living with exposed brick walls and steel accents',
        altText: 'Loft living room with brick walls, leather sofa, and metal shelving',
        tags: ['brick', 'steel', 'leather', 'loft'],
      },
      {
        url: 'https://images.unsplash.com/photo-1556909172-54557c7e4fb7?w=800',
        filename: 'kitchen-raw.jpg',
        roomType: 'kitchen',
        caption: 'Raw industrial kitchen with concrete counters and pipe shelving',
        altText: 'Industrial kitchen with open pipe shelving, concrete surfaces, and metal stools',
        tags: ['concrete', 'pipe-shelving', 'raw', 'metal'],
      },
      {
        url: 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=800',
        filename: 'office-warehouse.jpg',
        roomType: 'office',
        caption: 'Warehouse-style office with reclaimed wood desk and Edison bulbs',
        altText: 'Industrial office with reclaimed wood desk, metal chair, and hanging Edison bulbs',
        tags: ['reclaimed-wood', 'edison-bulbs', 'warehouse', 'desk'],
      },
      {
        url: 'https://images.unsplash.com/photo-1600573472591-ee6b68d14c68?w=800',
        filename: 'dining-urban.jpg',
        roomType: 'dining',
        caption: 'Urban industrial dining with metal chairs and factory-style lighting',
        altText: 'Dining area with rustic wood table, metal chairs, and oversized pendant lights',
        tags: ['metal-chairs', 'factory-lighting', 'rustic', 'urban'],
      },
      {
        url: 'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=800',
        filename: 'bedroom-loft.jpg',
        roomType: 'bedroom',
        caption: 'Loft bedroom with exposed ductwork and warm wood accents',
        altText: 'Industrial bedroom with exposed ceiling, iron bed frame, and warm textiles',
        tags: ['exposed-ductwork', 'iron-bed', 'loft', 'warm-textiles'],
      },
    ],
  },
  {
    styleSlug: 'japandi',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1600210491369-e753d80a41f3?w=800',
        filename: 'living-zen.jpg',
        roomType: 'living',
        caption: 'Zen Japandi living room with low furniture and natural materials',
        altText: 'Japandi living room with low sofa, tatami elements, and indoor plant',
        tags: ['zen', 'low-furniture', 'tatami', 'natural'],
      },
      {
        url: 'https://images.unsplash.com/photo-1600585152220-90363fe7e115?w=800',
        filename: 'kitchen-wabi-sabi.jpg',
        roomType: 'kitchen',
        caption: 'Wabi-sabi kitchen with handmade ceramics and bamboo accents',
        altText: 'Japandi kitchen with wooden counters, ceramic dishes, and minimal decor',
        tags: ['wabi-sabi', 'ceramics', 'bamboo', 'handmade'],
      },
      {
        url: 'https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?w=800',
        filename: 'bedroom-minimal-warm.jpg',
        roomType: 'bedroom',
        caption: 'Japandi bedroom balancing minimalism with warm, organic textures',
        altText: 'Bedroom with futon-style bed, paper lantern, and cedar wood shelf',
        tags: ['futon', 'paper-lantern', 'cedar', 'organic'],
      },
      {
        url: 'https://images.unsplash.com/photo-1600607687644-aac4c3eac7f4?w=800',
        filename: 'bathroom-stone.jpg',
        roomType: 'bathroom',
        caption: 'Japandi bathroom with natural stone and soaking tub',
        altText: 'Bathroom with stone walls, wooden vanity, and Japanese soaking tub',
        tags: ['stone', 'soaking-tub', 'wooden-vanity', 'zen'],
      },
      {
        url: 'https://images.unsplash.com/photo-1600121848594-d8644e57abab?w=800',
        filename: 'dining-organic.jpg',
        roomType: 'dining',
        caption: 'Organic Japandi dining space with clay pottery and linen textiles',
        altText: 'Dining room with round wooden table, clay vase, and linen runner',
        tags: ['organic', 'clay', 'linen', 'round-table'],
      },
    ],
  },
  {
    styleSlug: 'mediterranean',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800',
        filename: 'living-terracotta.jpg',
        roomType: 'living',
        caption: 'Mediterranean living room with terracotta floors and arched doorways',
        altText: 'Warm living room with terracotta tile, plaster walls, and wooden beams',
        tags: ['terracotta', 'arched', 'plaster', 'wooden-beams'],
      },
      {
        url: 'https://images.unsplash.com/photo-1600585153490-76fb20a32601?w=800',
        filename: 'kitchen-tuscan.jpg',
        roomType: 'kitchen',
        caption: 'Tuscan-inspired kitchen with stone counters and wrought iron fixtures',
        altText: 'Mediterranean kitchen with stone surfaces, olive wood cutting board, and tile backsplash',
        tags: ['tuscan', 'stone', 'wrought-iron', 'tile'],
      },
      {
        url: 'https://images.unsplash.com/photo-1600566752355-35792bedcfea?w=800',
        filename: 'bathroom-coastal.jpg',
        roomType: 'bathroom',
        caption: 'Coastal Mediterranean bathroom with hand-painted tiles and natural stone',
        altText: 'Bathroom with blue and white painted tiles, stone basin, and natural light',
        tags: ['coastal', 'hand-painted-tiles', 'stone-basin', 'blue-white'],
      },
      {
        url: 'https://images.unsplash.com/photo-1600573472592-401b489a3cdc?w=800',
        filename: 'dining-courtyard.jpg',
        roomType: 'dining',
        caption: 'Mediterranean courtyard dining with olive trees and terracotta pots',
        altText: 'Outdoor dining area with rustic wood table, terracotta pots, and string lights',
        tags: ['courtyard', 'olive-tree', 'terracotta-pots', 'outdoor'],
      },
      {
        url: 'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=800',
        filename: 'bedroom-warm-earth.jpg',
        roomType: 'bedroom',
        caption: 'Warm earth-toned Mediterranean bedroom with linen and wrought iron bed',
        altText: 'Bedroom with warm plaster walls, wrought iron bed, and linen curtains',
        tags: ['earth-tones', 'wrought-iron-bed', 'linen', 'plaster'],
      },
    ],
  },
];
