# E2E Test Engineer - Memory

## Initial Setup (2026-02-18)
- Playwright installed at monorepo root as devDependency
- Config at `e2e/playwright.config.ts` — Chromium only, sequential, 60s timeout
- Page objects: `DashboardPage`, `SessionPage`
- Helpers: `ApiHelper` (REST setup/teardown), `waitForStreamComplete` (DOM-based)
- Test IDs added to: chat-view, chat-input, message-list, create-session-button, session-list
- CI job `e2e-tests` in quality-gates.yml depends on backend + frontend quality passing
