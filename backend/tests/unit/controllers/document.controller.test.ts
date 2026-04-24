import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const { mockGetDocuments, mockGetDocQueue } = vi.hoisted(() => ({
  mockGetDocuments: vi.fn(),
  mockGetDocQueue: vi.fn(),
}));

vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

vi.mock('../../../src/services/document.service.js', () => ({
  DocumentService: vi.fn().mockImplementation(() => ({
    getDocuments: mockGetDocuments,
  })),
}));

vi.mock('../../../src/config/queue.js', () => ({
  getDocQueue: mockGetDocQueue,
}));

vi.mock('../../../src/utils/async.js', () => ({
  asyncHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

import {
  generateDocument,
  listDocuments,
  getDownloadUrl,
} from '../../../src/controllers/document.controller.js';

function mockReq(overrides: Record<string, unknown> = {}): Request {
  return {
    params: {},
    body: {},
    query: {},
    ...overrides,
  } as unknown as Request;
}

function mockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

const SESSION_ID = '00000000-0000-4000-a000-000000000001';
const DOC_ID = '00000000-0000-4000-a000-000000000002';
const ROOM_ID = '00000000-0000-4000-a000-000000000003';

describe('DocumentController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: queue.add resolves with a job id
    mockGetDocQueue.mockReturnValue({
      add: vi.fn().mockResolvedValue({ id: 'job-123' }),
    });
  });

  // ---------------------------------------------------------------------------
  // generateDocument
  // ---------------------------------------------------------------------------
  describe('generateDocument', () => {
    it('should return 202 with jobId and message for valid checklist_pdf request', async () => {
      const req = mockReq({
        params: { sessionId: SESSION_ID },
        body: { documentType: 'checklist_pdf' },
      });
      const res = mockRes();

      await generateDocument(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'queued',
          jobId: 'job-123',
          sessionId: SESSION_ID,
          documentType: 'checklist_pdf',
          message: expect.stringContaining('Document generation started'),
        })
      );
    });

    it('should return 202 and include roomId in queued payload for plan_pdf with roomId', async () => {
      const mockAdd = vi.fn().mockResolvedValue({ id: 'job-456' });
      mockGetDocQueue.mockReturnValue({ add: mockAdd });

      const req = mockReq({
        params: { sessionId: SESSION_ID },
        body: { documentType: 'plan_pdf', roomId: ROOM_ID },
      });
      const res = mockRes();

      await generateDocument(req, res, vi.fn());

      expect(mockAdd).toHaveBeenCalledWith(
        'doc:generate-plan',
        expect.objectContaining({
          sessionId: SESSION_ID,
          documentType: 'plan_pdf',
          roomId: ROOM_ID,
        })
      );
      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: 'job-456' })
      );
    });

    it('should return 400 validation error for invalid documentType (docx)', async () => {
      const req = mockReq({
        params: { sessionId: SESSION_ID },
        body: { documentType: 'docx' },
      });
      const res = mockRes();

      await generateDocument(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Validation Error' })
      );
    });

    it('should return 400 validation error when documentType is missing', async () => {
      const req = mockReq({
        params: { sessionId: SESSION_ID },
        body: {},
      });
      const res = mockRes();

      await generateDocument(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Validation Error' })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // listDocuments
  // ---------------------------------------------------------------------------
  describe('listDocuments', () => {
    it('should return all documents when no type filter is provided', async () => {
      const documents = [
        { id: DOC_ID, documentType: 'checklist_pdf', filename: 'checklist.pdf', signedUrl: null },
      ];
      mockGetDocuments.mockResolvedValue(documents);

      const req = mockReq({
        params: { sessionId: SESSION_ID },
        query: {},
      });
      const res = mockRes();

      await listDocuments(req, res, vi.fn());

      expect(mockGetDocuments).toHaveBeenCalledWith(SESSION_ID, undefined);
      expect(res.json).toHaveBeenCalledWith({ documents });
    });

    it('should pass the type filter to the service when ?type=checklist_pdf', async () => {
      const documents = [
        { id: DOC_ID, documentType: 'checklist_pdf', filename: 'checklist.pdf', signedUrl: null },
      ];
      mockGetDocuments.mockResolvedValue(documents);

      const req = mockReq({
        params: { sessionId: SESSION_ID },
        query: { type: 'checklist_pdf' },
      });
      const res = mockRes();

      await listDocuments(req, res, vi.fn());

      expect(mockGetDocuments).toHaveBeenCalledWith(SESSION_ID, 'checklist_pdf');
      expect(res.json).toHaveBeenCalledWith({ documents });
    });

    it('should return 400 for an invalid type query parameter', async () => {
      const req = mockReq({
        params: { sessionId: SESSION_ID },
        query: { type: 'invalid_type' },
      });
      const res = mockRes();

      await listDocuments(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Validation Error' })
      );
      expect(mockGetDocuments).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // getDownloadUrl
  // ---------------------------------------------------------------------------
  describe('getDownloadUrl', () => {
    it('should return 200 with signedUrl when document is found', async () => {
      const documents = [
        {
          id: DOC_ID,
          filename: 'plan.pdf',
          signedUrl: 'https://storage.example.com/signed/plan.pdf?token=abc123',
        },
      ];
      mockGetDocuments.mockResolvedValue(documents);

      const req = mockReq({
        params: { sessionId: SESSION_ID, docId: DOC_ID },
      });
      const res = mockRes();

      await getDownloadUrl(req, res, vi.fn());

      expect(mockGetDocuments).toHaveBeenCalledWith(SESSION_ID);
      expect(res.json).toHaveBeenCalledWith({
        documentId: DOC_ID,
        filename: 'plan.pdf',
        signedUrl: 'https://storage.example.com/signed/plan.pdf?token=abc123',
      });
    });

    it('should return 404 when the docId does not match any document', async () => {
      const documents = [
        {
          id: '00000000-0000-4000-a000-999999999999',
          filename: 'other.pdf',
          signedUrl: 'https://storage.example.com/other.pdf',
        },
      ];
      mockGetDocuments.mockResolvedValue(documents);

      const req = mockReq({
        params: { sessionId: SESSION_ID, docId: DOC_ID },
      });
      const res = mockRes();

      await getDownloadUrl(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Document not found' });
    });

    it('should return 503 when document is found but signedUrl is null', async () => {
      const documents = [
        {
          id: DOC_ID,
          filename: 'plan.pdf',
          signedUrl: null,
        },
      ];
      mockGetDocuments.mockResolvedValue(documents);

      const req = mockReq({
        params: { sessionId: SESSION_ID, docId: DOC_ID },
      });
      const res = mockRes();

      await getDownloadUrl(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('Storage not configured') })
      );
    });
  });
});
