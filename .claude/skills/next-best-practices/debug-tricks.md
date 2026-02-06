# Debug Tricks

Tricks to speed up debugging Next.js applications.

## MCP Endpoint (Dev Server)

Next.js exposes a `/_next/mcp` endpoint in development for AI-assisted debugging.

- **Next.js 16+**: Enabled by default
- **Next.js < 16**: Requires `experimental.mcpServer: true`

### Available Tools

#### `get_errors`
Get current errors from dev server:
```json
{ "name": "get_errors", "arguments": {} }
```

#### `get_routes`
Discover all routes:
```json
{ "name": "get_routes", "arguments": {} }
```

#### `get_project_metadata`
Get project path and dev server URL:
```json
{ "name": "get_project_metadata", "arguments": {} }
```

## Rebuild Specific Routes (Next.js 16+)

Use `--debug-build-paths` to rebuild only specific routes:

```bash
# Rebuild a specific route
next build --debug-build-paths "/dashboard"

# Rebuild routes matching a glob
next build --debug-build-paths "/api/*"

# Dynamic routes
next build --debug-build-paths "/blog/[slug]"
```
