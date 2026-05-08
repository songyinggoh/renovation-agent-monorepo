# Font Loading for Puppeteer

How to load the project's custom fonts in Puppeteer-rendered HTML templates.

## Project Fonts

| Font | CSS Variable | Usage | Weight(s) |
|---|---|---|---|
| Inter | `--font-sans` | Body text, UI labels | 300, 400, 500, 600, 700 |
| DM Serif Display | `--font-display` | h1, h2 headings | 400 |
| DM Serif Text | `--font-display-text` | h3-h6 headings | 400 |
| JetBrains Mono | `--font-mono` | Code, currency, measurements | 400, 500 |

Source: `frontend/lib/fonts.ts`

## Strategy: Google Fonts @import (Recommended)

Use `@import` in the template's `<style>` block. Puppeteer loads external resources when rendering.

```html
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=DM+Serif+Display&family=DM+Serif+Text&family=JetBrains+Mono:wght@400;500&display=swap');
</style>
```

**Pros**: Simple, no font files to manage, always up-to-date
**Cons**: Requires network access at render time

### Puppeteer Configuration for Network Fonts

When generating PDF, wait for fonts to load:

```typescript
const page = await browser.newPage();
await page.setContent(html, {
  waitUntil: 'networkidle0',  // Wait for all network requests to complete
});

// Additional font-specific wait
await page.evaluate(() => document.fonts.ready);

const pdf = await page.pdf({
  format: 'A4',
  margin: { top: '15mm', right: '15mm', bottom: '20mm', left: '15mm' },
  printBackground: true,
  preferCSSPageSize: true,
});
```

**Critical**: `waitUntil: 'networkidle0'` ensures Google Fonts are loaded before rendering. Without this, headings will fall back to Georgia.

## Strategy: Bundled Font Files (Docker/Offline)

For Docker environments without internet access, bundle font files:

### Step 1: Download fonts

```bash
# Download from Google Fonts (woff2 format)
mkdir -p backend/assets/fonts
cd backend/assets/fonts

# Download Inter, DM Serif Display, DM Serif Text, JetBrains Mono
# Use google-webfonts-helper or download directly
```

### Step 2: Base64 embed in template

For maximum portability, embed fonts as base64 in the `<style>` block:

```css
@font-face {
  font-family: 'Inter';
  font-weight: 400;
  font-style: normal;
  src: url(data:font/woff2;base64,AAAA...) format('woff2');
}

/* Repeat for each weight and font family */
```

**Pros**: Works offline, no network dependency
**Cons**: Large template size (~200KB+ for all fonts), harder to maintain

### Step 3: File-based @font-face (Alternative)

If templates are rendered from the filesystem:

```css
@font-face {
  font-family: 'Inter';
  font-weight: 400;
  src: url('file:///app/assets/fonts/inter-regular.woff2') format('woff2');
}
```

**Note**: Puppeteer must have `--allow-file-access-from-files` flag.

## Docker Font Installation

For Alpine-based Docker images, install system fonts as fallback:

```dockerfile
# In Dockerfile
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto \
    font-noto-emoji

# Set Puppeteer to use system Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
```

For Debian-based:

```dockerfile
RUN apt-get update && apt-get install -y \
    fonts-inter \
    fonts-liberation \
    fonts-noto-core \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*
```

## Font Fallback Chain

Always define fallbacks in CSS in case custom fonts fail to load:

```css
/* Body */
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

/* Display headings */
font-family: 'DM Serif Display', Georgia, 'Times New Roman', serif;

/* Text headings */
font-family: 'DM Serif Text', Georgia, 'Times New Roman', serif;

/* Monospace */
font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
```

## Verifying Fonts Loaded

Add this debug helper during development:

```typescript
// In doc.service.ts, before generating PDF
const fontStatus = await page.evaluate(() => {
  const fonts = Array.from(document.fonts);
  return fonts.map(f => ({
    family: f.family,
    weight: f.weight,
    status: f.status,
  }));
});
logger.debug('Font loading status', { fonts: fontStatus });
```

Expected output when all fonts are loaded:
```json
[
  { "family": "Inter", "weight": "400", "status": "loaded" },
  { "family": "DM Serif Display", "weight": "400", "status": "loaded" },
  { "family": "DM Serif Text", "weight": "400", "status": "loaded" },
  { "family": "JetBrains Mono", "weight": "400", "status": "loaded" }
]
```

## Decision Matrix

| Environment | Strategy | Rationale |
|---|---|---|
| **Local dev** | Google Fonts `@import` | Simple, fast iteration |
| **CI tests** | Google Fonts `@import` (with timeout) | Tests need real fonts for snapshot comparison |
| **Docker (internet)** | Google Fonts `@import` + system fallbacks | Primary from CDN, fallback if network slow |
| **Docker (air-gapped)** | Bundled font files | No network dependency |
| **Production** | Google Fonts `@import` + system fonts | CDN is fast and reliable, system fonts as safety net |
