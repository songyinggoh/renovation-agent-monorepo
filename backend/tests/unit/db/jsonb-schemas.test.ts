import { describe, it, expect } from 'vitest';
import {
  AssetMetadataSchema,
  StyleImageTagsSchema,
  VariantProcessingConfigSchema,
  DocumentMetadataSchema,
  ProductCatalogMetadataSchema,
} from '../../../src/db/jsonb-schemas.js';
import { validateJsonb, validateJsonbOptional } from '../../../src/db/jsonb-validators.js';

// ---------------------------------------------------------------------------
// AssetMetadataSchema
// ---------------------------------------------------------------------------
describe('AssetMetadataSchema', () => {
  it('accepts valid full metadata', () => {
    const data = {
      width: 1920,
      height: 1080,
      orientation: 'landscape' as const,
      roomAngle: 'overview' as const,
      lighting: 'natural' as const,
      scale: '1:50',
      dimensions: { length: 12, width: 10, unit: 'ft' as const },
      style: 'modern',
      thumbnailGenerated: true,
      compressionApplied: false,
      originalSize: 5000000,
    };
    expect(AssetMetadataSchema.parse(data)).toEqual(data);
  });

  it('accepts empty object (all fields optional)', () => {
    expect(AssetMetadataSchema.parse({})).toEqual({});
  });

  it('passes through unknown extra keys', () => {
    const data = { width: 800, customField: 'hello' };
    const result = AssetMetadataSchema.parse(data);
    expect(result).toHaveProperty('customField', 'hello');
  });

  it('rejects invalid orientation', () => {
    expect(() => AssetMetadataSchema.parse({ orientation: 'diagonal' })).toThrow();
  });

  it('rejects negative width', () => {
    expect(() => AssetMetadataSchema.parse({ width: -100 })).toThrow();
  });

  it('rejects invalid dimensions unit', () => {
    expect(() =>
      AssetMetadataSchema.parse({ dimensions: { length: 10, width: 8, unit: 'km' } })
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// StyleImageTagsSchema
// ---------------------------------------------------------------------------
describe('StyleImageTagsSchema', () => {
  it('accepts valid string array', () => {
    const tags = ['modern', 'kitchen', 'white'];
    expect(StyleImageTagsSchema.parse(tags)).toEqual(tags);
  });

  it('accepts empty array', () => {
    expect(StyleImageTagsSchema.parse([])).toEqual([]);
  });

  it('rejects non-array', () => {
    expect(() => StyleImageTagsSchema.parse('modern')).toThrow();
  });

  it('rejects empty strings', () => {
    expect(() => StyleImageTagsSchema.parse(['modern', ''])).toThrow();
  });
});

// ---------------------------------------------------------------------------
// VariantProcessingConfigSchema
// ---------------------------------------------------------------------------
describe('VariantProcessingConfigSchema', () => {
  it('accepts valid config', () => {
    const config = {
      quality: 85,
      maxWidth: 1200,
      maxHeight: 800,
      preserveAspectRatio: true,
      stripMetadata: true,
      sharpen: false,
    };
    expect(VariantProcessingConfigSchema.parse(config)).toEqual(config);
  });

  it('accepts empty object', () => {
    expect(VariantProcessingConfigSchema.parse({})).toEqual({});
  });

  it('passes through unknown extra keys for backward compat', () => {
    const config = { quality: 80, legacyFlag: true };
    const result = VariantProcessingConfigSchema.parse(config);
    expect(result).toHaveProperty('legacyFlag', true);
  });

  it('rejects quality out of range (0)', () => {
    expect(() => VariantProcessingConfigSchema.parse({ quality: 0 })).toThrow();
  });

  it('rejects quality out of range (101)', () => {
    expect(() => VariantProcessingConfigSchema.parse({ quality: 101 })).toThrow();
  });

  it('rejects negative maxWidth', () => {
    expect(() => VariantProcessingConfigSchema.parse({ maxWidth: -1 })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// DocumentMetadataSchema
// ---------------------------------------------------------------------------
describe('DocumentMetadataSchema', () => {
  it('accepts valid metadata', () => {
    const data = {
      sections: ['Introduction', 'Budget', 'Timeline'],
      watermarked: false,
      signed: true,
      interactive: false,
      language: 'en',
      templateId: '550e8400-e29b-41d4-a716-446655440000',
      generatedFrom: '550e8400-e29b-41d4-a716-446655440001',
    };
    expect(DocumentMetadataSchema.parse(data)).toEqual(data);
  });

  it('accepts empty object', () => {
    expect(DocumentMetadataSchema.parse({})).toEqual({});
  });

  it('passes through unknown extra keys for backward compat', () => {
    const data = { sections: ['Intro'], revision: 3 };
    const result = DocumentMetadataSchema.parse(data);
    expect(result).toHaveProperty('revision', 3);
  });

  it('rejects invalid templateId (not UUID)', () => {
    expect(() => DocumentMetadataSchema.parse({ templateId: 'not-a-uuid' })).toThrow();
  });

  it('rejects language longer than 10 chars', () => {
    expect(() => DocumentMetadataSchema.parse({ language: 'a'.repeat(11) })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// ProductCatalogMetadataSchema
// ---------------------------------------------------------------------------
describe('ProductCatalogMetadataSchema', () => {
  it('accepts valid product metadata', () => {
    const data = {
      brand: 'IKEA',
      style: ['modern', 'scandinavian'],
      roomTypes: ['kitchen', 'living'],
      material: 'oak',
      dimensions: '120x60x75cm',
    };
    expect(ProductCatalogMetadataSchema.parse(data)).toEqual(data);
  });

  it('accepts minimal required fields', () => {
    const data = {
      brand: 'West Elm',
      style: ['contemporary'],
      roomTypes: ['bedroom'],
    };
    expect(ProductCatalogMetadataSchema.parse(data)).toEqual(data);
  });

  it('rejects missing brand', () => {
    expect(() =>
      ProductCatalogMetadataSchema.parse({ style: ['modern'], roomTypes: ['kitchen'] })
    ).toThrow();
  });

  it('rejects empty style array entries', () => {
    expect(() =>
      ProductCatalogMetadataSchema.parse({ brand: 'Test', style: [''], roomTypes: ['kitchen'] })
    ).toThrow();
  });

  it('rejects empty brand', () => {
    expect(() =>
      ProductCatalogMetadataSchema.parse({ brand: '', style: ['modern'], roomTypes: ['kitchen'] })
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// RenovationPlanSchema (and nested schemas added in 3A-01)
// ---------------------------------------------------------------------------
import {
  RenovationTaskSchema,
  RenovationPlanSchema,
} from '../../../src/db/jsonb-schemas.js';

const VALID_TASK = {
  id: 'task-1',
  description: 'Install new cabinets',
  estimatedCost: 10000,
  duration: 5,
  tradeCategory: 'carpentry' as const,
};

const VALID_PLAN = {
  summary: 'Complete kitchen renovation',
  totalBudget: 25000,
  totalDays: 21,
  generatedAt: '2026-03-16T00:00:00Z',
  rooms: [{
    roomId: 'room-uuid-1',
    roomName: 'Kitchen',
    estimatedCost: 25000,
    estimatedDays: 21,
    tasks: [VALID_TASK],
  }],
};

describe('RenovationTaskSchema', () => {
  it('accepts a valid task', () => {
    expect(RenovationTaskSchema.parse(VALID_TASK)).toMatchObject(VALID_TASK);
  });

  it('accepts $0 estimatedCost (nonnegative)', () => {
    expect(() => RenovationTaskSchema.parse({ ...VALID_TASK, estimatedCost: 0 })).not.toThrow();
  });

  it('rejects negative estimatedCost', () => {
    expect(() => RenovationTaskSchema.parse({ ...VALID_TASK, estimatedCost: -1 })).toThrow();
  });

  it('rejects invalid tradeCategory', () => {
    expect(() => RenovationTaskSchema.parse({ ...VALID_TASK, tradeCategory: 'masonry' })).toThrow();
  });

  it('rejects non-integer duration', () => {
    expect(() => RenovationTaskSchema.parse({ ...VALID_TASK, duration: 2.5 })).toThrow();
  });

  it('passes through unknown extra keys', () => {
    const result = RenovationTaskSchema.parse({ ...VALID_TASK, legacyField: 'old' });
    expect(result).toHaveProperty('legacyField', 'old');
  });

  it('defaults priority to medium when omitted', () => {
    const result = RenovationTaskSchema.parse(VALID_TASK);
    expect(result.priority).toBe('medium');
  });

  it('defaults dependencies to empty array when omitted', () => {
    const result = RenovationTaskSchema.parse(VALID_TASK);
    expect(result.dependencies).toEqual([]);
  });
});

describe('RenovationPlanSchema', () => {
  it('accepts a valid full plan', () => {
    const result = RenovationPlanSchema.parse(VALID_PLAN);
    expect(result.totalBudget).toBe(25000);
    expect(result.rooms).toHaveLength(1);
  });

  it('accepts $0 totalBudget (nonnegative)', () => {
    expect(() => RenovationPlanSchema.parse({ ...VALID_PLAN, totalBudget: 0 })).not.toThrow();
  });

  it('rejects missing rooms array', () => {
    const { rooms: _rooms, ...withoutRooms } = VALID_PLAN; // eslint-disable-line @typescript-eslint/no-unused-vars
    expect(() => RenovationPlanSchema.parse(withoutRooms)).toThrow();
  });

  it('rejects missing generatedAt', () => {
    const { generatedAt: _g, ...withoutDate } = VALID_PLAN; // eslint-disable-line @typescript-eslint/no-unused-vars
    expect(() => RenovationPlanSchema.parse(withoutDate)).toThrow();
  });

  it('rejects non-integer totalDays', () => {
    expect(() => RenovationPlanSchema.parse({ ...VALID_PLAN, totalDays: 3.5 })).toThrow();
  });

  it('defaults contractors to empty array when omitted', () => {
    const result = RenovationPlanSchema.parse(VALID_PLAN);
    expect(result.contractors).toEqual([]);
  });

  it('defaults warnings to empty array when omitted', () => {
    const result = RenovationPlanSchema.parse(VALID_PLAN);
    expect(result.warnings).toEqual([]);
  });

  it('passes through unknown extra keys for forward DB compatibility', () => {
    const result = RenovationPlanSchema.parse({ ...VALID_PLAN, futureField: 'value' });
    expect(result).toHaveProperty('futureField', 'value');
  });

  it('rejects invalid task tradeCategory in nested room', () => {
    const badPlan = {
      ...VALID_PLAN,
      rooms: [{ ...VALID_PLAN.rooms[0], tasks: [{ ...VALID_TASK, tradeCategory: 'magic' }] }],
    };
    expect(() => RenovationPlanSchema.parse(badPlan)).toThrow();
  });

  it('accepts non-strict ISO strings for generatedAt (agent may omit milliseconds)', () => {
    expect(() => RenovationPlanSchema.parse({ ...VALID_PLAN, generatedAt: '2026-03-16' })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// validateJsonb / validateJsonbOptional helpers
// ---------------------------------------------------------------------------
describe('validateJsonb', () => {
  it('returns typed data on success', () => {
    const result = validateJsonb(AssetMetadataSchema, { width: 100 }, 'test.metadata');
    expect(result.width).toBe(100);
  });

  it('throws with context on failure', () => {
    expect(() =>
      validateJsonb(AssetMetadataSchema, { width: -1 }, 'room_assets.metadata')
    ).toThrow('JSONB validation failed for room_assets.metadata');
  });
});

describe('validateJsonbOptional', () => {
  it('returns undefined for null', () => {
    expect(validateJsonbOptional(AssetMetadataSchema, null, 'test')).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(validateJsonbOptional(AssetMetadataSchema, undefined, 'test')).toBeUndefined();
  });

  it('validates non-nullish data', () => {
    const result = validateJsonbOptional(AssetMetadataSchema, { width: 200 }, 'test');
    expect(result?.width).toBe(200);
  });
});
