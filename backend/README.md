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

## License

ISC 