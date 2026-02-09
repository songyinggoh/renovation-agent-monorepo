import { type NewStyleCatalogEntry } from '../db/schema/styles.schema.js';

type SeedStyle = Omit<NewStyleCatalogEntry, 'id' | 'createdAt' | 'updatedAt'>;

export const SEED_STYLES: SeedStyle[] = [
  {
    name: 'Modern Minimalist',
    slug: 'modern-minimalist',
    description:
      'Clean lines, neutral palette, and functional spaces. Emphasizes open floor plans, natural light, and carefully curated furnishings with a "less is more" philosophy.',
    colorPalette: [
      { name: 'White', hex: '#FFFFFF' },
      { name: 'Light Gray', hex: '#E5E5E5' },
      { name: 'Charcoal', hex: '#374151' },
      { name: 'Warm Beige', hex: '#D4C5A9' },
      { name: 'Matte Black', hex: '#1A1A1A' },
    ],
    materials: ['concrete', 'glass', 'steel', 'white oak', 'marble'],
    keywords: ['minimal', 'clean', 'modern', 'sleek', 'simple', 'neutral', 'contemporary'],
    imageUrls: [],
    metadata: {
      suitableRooms: ['kitchen', 'living', 'bathroom', 'bedroom', 'office'],
      era: 'contemporary',
      origin: 'International',
    },
  },
  {
    name: 'Warm Scandinavian',
    slug: 'warm-scandinavian',
    description:
      'Hygge-inspired spaces with light woods, soft textures, and a warm neutral palette. Focuses on comfort, natural materials, and cozy layering while maintaining Scandinavian simplicity.',
    colorPalette: [
      { name: 'Warm White', hex: '#FAF7F2' },
      { name: 'Soft Blush', hex: '#E8D5CC' },
      { name: 'Pale Oak', hex: '#C4A882' },
      { name: 'Dusty Blue', hex: '#8FA8B8' },
      { name: 'Forest Green', hex: '#4A6741' },
    ],
    materials: ['birch', 'pine', 'wool', 'linen', 'ceramic', 'sheepskin'],
    keywords: ['scandinavian', 'hygge', 'cozy', 'nordic', 'warm', 'natural', 'light wood'],
    imageUrls: [],
    metadata: {
      suitableRooms: ['living', 'bedroom', 'dining', 'kitchen'],
      era: 'contemporary',
      origin: 'Scandinavia',
    },
  },
  {
    name: 'Industrial Loft',
    slug: 'industrial-loft',
    description:
      'Raw, urban aesthetic inspired by converted warehouses and factories. Features exposed brick, metal fixtures, reclaimed wood, and open-concept layouts with high ceilings.',
    colorPalette: [
      { name: 'Exposed Brick', hex: '#8B4513' },
      { name: 'Raw Steel', hex: '#71797E' },
      { name: 'Concrete Gray', hex: '#A9A9A9' },
      { name: 'Dark Walnut', hex: '#3B2F2F' },
      { name: 'Aged Copper', hex: '#B87333' },
    ],
    materials: ['brick', 'steel', 'reclaimed wood', 'concrete', 'iron', 'leather'],
    keywords: ['industrial', 'loft', 'urban', 'raw', 'exposed', 'warehouse', 'rustic'],
    imageUrls: [],
    metadata: {
      suitableRooms: ['living', 'kitchen', 'office', 'dining'],
      era: 'industrial revival',
      origin: 'New York / London',
    },
  },
  {
    name: 'Japandi',
    slug: 'japandi',
    description:
      'A harmonious blend of Japanese minimalism and Scandinavian functionality. Celebrates imperfection (wabi-sabi), natural materials, and intentional simplicity with warm undertones.',
    colorPalette: [
      { name: 'Rice Paper', hex: '#F5F0E8' },
      { name: 'Bamboo', hex: '#D4B896' },
      { name: 'Ink', hex: '#2C2C2C' },
      { name: 'Sage', hex: '#9CAF88' },
      { name: 'Clay', hex: '#B5836A' },
    ],
    materials: ['bamboo', 'cedar', 'stone', 'clay', 'paper', 'linen', 'rattan'],
    keywords: ['japandi', 'wabi-sabi', 'zen', 'minimal', 'japanese', 'scandinavian', 'organic'],
    imageUrls: [],
    metadata: {
      suitableRooms: ['bedroom', 'living', 'bathroom', 'dining'],
      era: 'contemporary fusion',
      origin: 'Japan / Scandinavia',
    },
  },
  {
    name: 'Mediterranean',
    slug: 'mediterranean',
    description:
      'Sun-drenched warmth inspired by coastal Southern European homes. Rich terracotta tones, natural stone, wrought iron details, and lush textures create inviting, earthy spaces.',
    colorPalette: [
      { name: 'Terracotta', hex: '#C4724A' },
      { name: 'Olive', hex: '#708238' },
      { name: 'Warm Sand', hex: '#E8D4B8' },
      { name: 'Azure Blue', hex: '#336699' },
      { name: 'Cream', hex: '#FFF8E7' },
    ],
    materials: ['terracotta', 'natural stone', 'wrought iron', 'tile', 'stucco', 'olive wood'],
    keywords: ['mediterranean', 'tuscan', 'coastal', 'warm', 'earthy', 'rustic', 'european'],
    imageUrls: [],
    metadata: {
      suitableRooms: ['kitchen', 'dining', 'living', 'bathroom', 'patio'],
      era: 'timeless',
      origin: 'Southern Europe',
    },
  },
];
