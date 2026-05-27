# PDF Pipeline Specialist - Memory

## Status
- Agent created: 2026-02-20
- Phase 3.1 (Document Generation): Not yet implemented
- `doc.worker.ts`: Skeleton/no-op — ready for implementation

## Known Issues (from PLAN-CHECK.md)
- C1: `doc:generate-plan` job type requires `roomId` but should be optional
- C2: Document type name mismatch (`'checklist'` vs `'checklist_pdf'`)
- C4: Alpine Docker needs Chromium setup for Puppeteer
- C5: `closeQueues()` doesn't include docQueue

## Key Decisions Pending
- Template engine: Handlebars (recommended) vs EJS
- Docker base: Alpine + chromium APK vs Debian slim
- Font strategy: Google Fonts @import vs bundled font files
