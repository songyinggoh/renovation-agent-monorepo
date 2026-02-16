# Express TypeScript Boilerplate

A modern Express.js boilerplate using TypeScript, featuring a well-structured project setup with best practices.

## Features

- Express.js with TypeScript
- Structured project layout
- Error handling middleware
- Docker support
- Environment variables support
- CORS enabled
- ESLint for code quality
- Jest for testing

## Project Structure

```
src/
├── config/         # Configuration files
├── controllers/    # Route controllers
├── middleware/     # Custom middleware
├── models/         # Data models
├── routes/         # Application routes
├── services/       # Business logic
├── types/          # Custom type/interface definitions
└── app.ts          # Application entry point
```

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Docker (optional)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd express-ts-boilerplate
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```
PORT=3000
NODE_ENV=development
```

### Development

Start the development server:
```bash
npm run dev
```

### Building for Production

Build the project:
```bash
npm run build
```

Start the production server:
```bash
npm start
```

### Docker

Build the Docker image:
```bash
docker build -t express-ts-app .
```

Run the container:
```bash
docker run -p 3000:3000 express-ts-app
```

## Scripts

- `npm run dev`: Start development server
- `npm run build`: Build for production
- `npm start`: Start production server
- `npm run lint`: Run ESLint
- `npm test`: Run tests

## Observability (OpenTelemetry)

The backend includes a full OpenTelemetry instrumentation stack (Phases IV.1-6) providing distributed tracing across HTTP, database, Socket.io, and AI operations.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OTEL_ENABLED` | `true` | Set to `false` to disable all telemetry |
| `OTEL_SERVICE_NAME` | `renovation-agent-backend` | Service name in traces |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | OTLP collector endpoint |
| `OTEL_EXPORTER_OTLP_HEADERS` | _(none)_ | Comma-separated `key=value` pairs (e.g., `x-honeycomb-team=YOUR_KEY`) |
| `OTEL_TRACES_SAMPLER_ARG` | `0.1` | Baseline sampling ratio (0.0-1.0). AI calls, errors, and chat messages are always sampled. |
| `OTEL_LOG_LEVEL` | `info` | OTel diagnostic log level (`none`, `error`, `warn`, `info`, `debug`, `verbose`). Forced to `error` in production. |

### Recommended Values by Environment

| Setting | Development | Staging | Production |
|---------|-------------|---------|------------|
| `OTEL_ENABLED` | `true` | `true` | `true` |
| `OTEL_TRACES_SAMPLER_ARG` | `1.0` (100%) | `0.5` (50%) | `0.1` (10%) |
| `OTEL_LOG_LEVEL` | `info` | `warn` | _forced to `error`_ |

### Supported Backends

Any OTLP-compatible collector works:
- **Jaeger** — `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`
- **Honeycomb** — set endpoint to `https://api.honeycomb.io` and add `x-honeycomb-team` header
- **Datadog** — use the Datadog OTLP ingest endpoint
- **Grafana Tempo** — direct OTLP ingestion

### Custom Sampling Strategy

The `RenovationSampler` always captures:
- HTTP 5xx errors
- AI/Gemini/LangGraph operations
- Security events (prompt injection detection)
- Socket.io chat messages
- Requests with `x-force-sample: true` header

Health check endpoints (`/health/*`) are sampled at 1%. Everything else uses the baseline ratio.

### Force Sampling

Send `x-force-sample: true` header on any HTTP request to guarantee the trace is captured, regardless of the sampling ratio. Useful for debugging specific requests or payment flows.

### Load Testing

```bash
# Requires k6 (https://k6.io)
npm run test:load
```

## License

ISC