/**
 * Entitlement gate tests for document.service.ts
 *
 * Covers generateChecklist() and generatePlan() payment gates.
 * The equivalent render.service.ts gates are already covered in
 * payment-security.test.ts (entitlement gates — requestRender).
 *
 * Rules under test:
 *   - PAYMENT, COMPLETE, ITERATE phases require isPaid=true
 *   - PLAN and RENDER phases are the "free preview" — no payment required
 *   - session not found throws NotFoundError (never reaches payment check)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const { mockDbSelect } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
}));

vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

vi.mock('../../../src/db/index.js', () => ({
  db: {
    select: mockDbSelect,
    update: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, val: unknown) => ({ eq: val })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  desc: vi.fn((col: unknown) => ({ desc: col })),
}));

vi.mock('../../../src/db/schema/sessions.schema.js', () => ({
  renovationSessions: {
    id: 'renovation_sessions.id',
    title: 'renovation_sessions.title',
    phase: 'renovation_sessions.phase',
    isPaid: 'renovation_sessions.is_paid',
    planData: 'renovation_sessions.plan_data',
    updatedAt: 'renovation_sessions.updated_at',
    createdAt: 'renovation_sessions.created_at',
  },
}));

vi.mock('../../../src/db/schema/rooms.schema.js', () => ({
  renovationRooms: {
    id: 'renovation_rooms.id',
    sessionId: 'renovation_rooms.session_id',
    name: 'renovation_rooms.name',
    roomType: 'renovation_rooms.room_type',
    checklist: 'renovation_rooms.checklist',
    renderUrls: 'renovation_rooms.render_urls',
    updatedAt: 'renovation_rooms.updated_at',
  },
}));

vi.mock('../../../src/db/schema/document-artifacts.schema.js', () => ({
  documentArtifacts: {
    id: 'document_artifacts.id',
    sessionId: 'document_artifacts.session_id',
    documentType: 'document_artifacts.document_type',
    version: 'document_artifacts.version',
    storagePath: 'document_artifacts.storage_path',
    createdAt: 'document_artifacts.created_at',
  },
}));

vi.mock('../../../src/db/schema/products.schema.js', () => ({
  productRecommendations: {},
}));

vi.mock('../../../src/db/jsonb-schemas.js', () => ({
  RenovationPlanSchema: {
    parse: vi.fn((data: unknown) => data),
  },
}));

vi.mock('../../../src/config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    SUPABASE_DOCUMENTS_BUCKET: 'renovation-documents',
    PUPPETEER_EXECUTABLE_PATH: undefined,
  },
  isPaymentsEnabled: vi.fn(() => false),
  isStorageEnabled: vi.fn(() => false),
  isPdfEnabled: vi.fn(() => true),
}));

vi.mock('../../../src/config/supabase.js', () => ({
  supabaseAdmin: null,
}));

// Stub out heavy Puppeteer / Chromium / Handlebars dependencies so the module
// can be imported without a real browser binary.
vi.mock('@sparticuz/chromium', () => ({
  default: {
    setGraphicsMode: false,
    args: [],
    executablePath: vi.fn().mockResolvedValue('/usr/bin/chromium'),
  },
}));

vi.mock('puppeteer-core', () => ({
  default: {
    launch: vi.fn().mockResolvedValue({
      connected: true,
      newPage: vi.fn().mockResolvedValue({
        setContent: vi.fn(),
        evaluateHandle: vi.fn(),
        pdf: vi.fn().mockResolvedValue(Buffer.from('PDF')),
        close: vi.fn(),
      }),
      process: vi.fn().mockReturnValue(null),
    }),
  },
}));

vi.mock('handlebars', () => ({
  default: {
    registerHelper: vi.fn(),
    registerPartial: vi.fn(),
    compile: vi.fn(() => vi.fn(() => '<html>template</html>')),
  },
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    readFileSync: vi.fn((path: string) => {
      // Allow real file reads for non-template paths; stub templates
      if (String(path).includes('templates')) return '';
      return actual.readFileSync(path);
    }),
  };
});

// ── Import after mocks ─────────────────────────────────────────────────────────
import { DocumentService } from '../../../src/services/document.service.js';
import { isPdfEnabled } from '../../../src/config/env.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Set up db.select().from().where() chain returning one result */
function setupSelectChain(returnValue: unknown[]) {
  const mockWhere = vi.fn().mockResolvedValue(returnValue);
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  mockDbSelect.mockReturnValue({ from: mockFrom });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DocumentService entitlement gates', () => {
  let service: DocumentService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DocumentService();
    // isPdfEnabled returns true so the method reaches the payment gate
    vi.mocked(isPdfEnabled).mockReturnValue(true);
  });

  // ── generateChecklist ───────────────────────────────────────────────────────

  describe('generateChecklist()', () => {
    it('throws "Payment required" when session is in PAYMENT phase and isPaid=false', async () => {
      setupSelectChain([{ id: 'session-abc', title: 'Test', phase: 'PAYMENT', isPaid: false }]);

      await expect(service.generateChecklist('session-abc')).rejects.toThrow(
        'Payment required to generate documents in this phase',
      );
    });

    it('throws "Payment required" when session is in COMPLETE phase and isPaid=false', async () => {
      setupSelectChain([{ id: 'session-abc', title: 'Test', phase: 'COMPLETE', isPaid: false }]);

      await expect(service.generateChecklist('session-abc')).rejects.toThrow(
        'Payment required to generate documents in this phase',
      );
    });

    it('throws "Payment required" when session is in ITERATE phase and isPaid=false', async () => {
      setupSelectChain([{ id: 'session-abc', title: 'Test', phase: 'ITERATE', isPaid: false }]);

      await expect(service.generateChecklist('session-abc')).rejects.toThrow(
        'Payment required to generate documents in this phase',
      );
    });

    it('does NOT throw the payment error when session is in PLAN phase and isPaid=false (free preview)', async () => {
      // Session in PLAN phase — free preview, so the payment gate must not throw.
      // We expect it to proceed past the gate and potentially fail on something
      // else (e.g. room query), not on "Payment required".
      setupSelectChain([{ id: 'session-abc', title: 'Test', phase: 'PLAN', isPaid: false }]);

      // After the payment gate, the service queries rooms. Return empty rooms so
      // it produces an empty-list result rather than a payment error.
      mockDbSelect
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ id: 'session-abc', title: 'Test', phase: 'PLAN', isPaid: false }]),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        });

      // Should NOT throw "Payment required" — any other error (or success) is fine
      const result = service.generateChecklist('session-abc');
      await expect(result).rejects.not.toThrow(
        'Payment required to generate documents in this phase',
      );
    });

    it('does NOT throw the payment error when session is in RENDER phase and isPaid=false (free preview)', async () => {
      setupSelectChain([{ id: 'session-abc', title: 'Test', phase: 'RENDER', isPaid: false }]);

      mockDbSelect
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ id: 'session-abc', title: 'Test', phase: 'RENDER', isPaid: false }]),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        });

      const result = service.generateChecklist('session-abc');
      await expect(result).rejects.not.toThrow(
        'Payment required to generate documents in this phase',
      );
    });

    it('passes the payment gate when session is in PAYMENT phase and isPaid=true', async () => {
      setupSelectChain([{ id: 'session-abc', title: 'Test', phase: 'PAYMENT', isPaid: true }]);

      mockDbSelect
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ id: 'session-abc', title: 'Test', phase: 'PAYMENT', isPaid: true }]),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        });

      // Should not throw the payment error (other errors from missing PDF env are fine)
      const result = service.generateChecklist('session-abc');
      await expect(result).rejects.not.toThrow(
        'Payment required to generate documents in this phase',
      );
    });
  });

  // ── generatePlan ────────────────────────────────────────────────────────────

  describe('generatePlan()', () => {
    it('throws "Payment required" when session is in PAYMENT phase and isPaid=false', async () => {
      setupSelectChain([{
        id: 'session-abc',
        title: 'Test',
        phase: 'PAYMENT',
        isPaid: false,
        planData: null,
      }]);

      await expect(service.generatePlan('session-abc')).rejects.toThrow(
        'Payment required to generate documents in this phase',
      );
    });

    it('throws "Payment required" when session is in COMPLETE phase and isPaid=false', async () => {
      setupSelectChain([{
        id: 'session-abc',
        title: 'Test',
        phase: 'COMPLETE',
        isPaid: false,
        planData: null,
      }]);

      await expect(service.generatePlan('session-abc')).rejects.toThrow(
        'Payment required to generate documents in this phase',
      );
    });

    it('throws "Payment required" when session is in ITERATE phase and isPaid=false', async () => {
      setupSelectChain([{
        id: 'session-abc',
        title: 'Test',
        phase: 'ITERATE',
        isPaid: false,
        planData: null,
      }]);

      await expect(service.generatePlan('session-abc')).rejects.toThrow(
        'Payment required to generate documents in this phase',
      );
    });

    it('does NOT throw the payment error when session is in PLAN phase and isPaid=false (free preview)', async () => {
      setupSelectChain([{
        id: 'session-abc',
        title: 'Test',
        phase: 'PLAN',
        isPaid: false,
        planData: null,
      }]);

      const result = service.generatePlan('session-abc');
      await expect(result).rejects.not.toThrow(
        'Payment required to generate documents in this phase',
      );
    });

    it('passes the payment gate when session is in COMPLETE phase and isPaid=true', async () => {
      setupSelectChain([{
        id: 'session-abc',
        title: 'Test',
        phase: 'COMPLETE',
        isPaid: true,
        planData: null,
      }]);

      const result = service.generatePlan('session-abc');
      // Should fail on something after the gate (e.g. missing planData), not on payment
      await expect(result).rejects.not.toThrow(
        'Payment required to generate documents in this phase',
      );
    });
  });
});
