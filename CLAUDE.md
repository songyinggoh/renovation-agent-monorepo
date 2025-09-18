# Website Template Monorepo - Development Guide

This document provides comprehensive guidance for AI coding assistants and developers working with this monorepo template. It outlines architecture patterns, development workflows, and best practices derived from production-tested patterns.

## Repository Architecture

This template provides a **complete full-stack monorepo** designed for modern web applications with clear separation of concerns:

- **Frontend**: Customer-facing Next.js application (port 3001)
- **Backend**: Admin/API Next.js application (port 3000)  
- **Database**: PostgreSQL with direct SQL queries (no ORM)
- **Infrastructure**: Docker, deployment configs, and development tools

## Tech Stack Overview

### Frontend (Customer Application)
- **Next.js 15** with App Router & TypeScript
- **Tailwind CSS** with custom design system and CSS variables
- **shadcn/ui** component library (Radix UI based)
- **TanStack Query v5** for server state management and caching
- **React Hook Form + Zod** for form validation and type safety
- **Lucide React** for consistent iconography
- **React Hot Toast** for notifications

### Backend (Admin/API Application)
- **Next.js 15** with App Router & TypeScript
- **PostgreSQL** with direct SQL queries via `pg` library
- **API Routes** for RESTful endpoints
- **Database utilities** with connection pooling
- **Type-safe** database operations with TypeScript
- **Admin dashboard** components and layouts

### Database & Infrastructure
- **PostgreSQL 15** with modern SQL features
- **Direct SQL** approach (no ORM) for optimal performance and control
- **Migration system** with versioned schema changes
- **Docker Compose** for local development environment
- **Environment configuration** templates for all stages

## Project Structure Deep Dive

```
website-template-monorepo/
├── frontend/                    # Customer-facing Next.js app (port 3001)
│   ├── app/                     # Next.js App Router
│   │   ├── layout.tsx          # Root layout with providers
│   │   ├── page.tsx            # Homepage
│   │   ├── globals.css         # Tailwind styles with CSS variables
│   │   └── api/                # Frontend API routes (if needed)
│   ├── components/             # Reusable UI components
│   │   ├── ui/                 # shadcn/ui components (Button, etc.)
│   │   └── providers/          # React context providers
│   │       ├── query-provider.tsx    # TanStack Query setup
│   │       └── theme-provider.tsx    # Theme/dark mode support
│   ├── lib/                    # Utilities and configurations
│   │   └── utils.ts           # Tailwind merge utilities
│   ├── hooks/                  # Custom React hooks
│   ├── types/                  # TypeScript type definitions
│   ├── package.json           # Frontend dependencies
│   ├── tsconfig.json          # TypeScript configuration
│   ├── tailwind.config.ts     # Tailwind CSS configuration
│   ├── components.json        # shadcn/ui configuration
│   ├── next.config.js         # Next.js configuration
│   └── .env.example           # Environment variables template
├── backend/                    # Admin/API Next.js app (port 3000)
│   ├── app/                    # Next.js App Router
│   │   ├── layout.tsx         # Admin layout
│   │   ├── page.tsx           # Admin dashboard
│   │   ├── globals.css        # Tailwind styles
│   │   └── api/               # API routes
│   │       └── items/         # Example CRUD endpoints
│   ├── components/            # Admin UI components
│   ├── lib/                   # Server utilities
│   │   └── db.ts             # Database connection and queries
│   ├── scripts/               # Database and utility scripts
│   ├── package.json          # Backend dependencies
│   ├── tsconfig.json         # TypeScript configuration
│   └── .env.example          # Environment variables template
├── database/                  # Database schema and data
│   ├── schema.sql            # Complete database schema
│   └── seed.sql              # Sample data for development
├── docker-compose.yml        # Local development environment
├── .gitignore               # Git ignore patterns
└── README.md                # Setup and usage instructions
```

## Development Workflows

### Initial Setup
1. **Clone and Install**:
   ```bash
   git clone <your-repo>
   cd website-template-monorepo
   
   # Install frontend dependencies
   cd frontend && npm install
   
   # Install backend dependencies  
   cd ../backend && npm install
   ```

2. **Environment Configuration**:
   ```bash
   # Copy and configure environment files
   cp frontend/.env.example frontend/.env.local
   cp backend/.env.example backend/.env.local
   
   # Edit .env.local files with your database and service credentials
   ```

3. **Database Setup**:
   ```bash
   # Option 1: Docker (recommended for development)
   docker-compose up postgres
   
   # Option 2: Manual PostgreSQL setup
   createdb your_app_db
   psql your_app_db < database/schema.sql
   psql your_app_db < database/seed.sql
   ```

### Development Server
```bash
# Terminal 1: Start backend (admin/API)
cd backend && npm run dev    # Runs on http://localhost:3000

# Terminal 2: Start frontend (customer app)  
cd frontend && npm run dev   # Runs on http://localhost:3001

# Optional: Full Docker environment
docker-compose up           # Starts all services
```

## Architecture Patterns

### Database Integration
- **Direct SQL Queries**: No ORM - use parameterized queries for performance
- **Connection Pooling**: `pg.Pool` for efficient database connections
- **Type Safety**: TypeScript interfaces for database models
- **Migration Strategy**: Versioned SQL files for schema changes

```typescript
// Example database operation
import { query } from '@/lib/db';

export async function getItems() {
  const result = await query('SELECT * FROM items WHERE is_active = $1', [true]);
  return result.rows;
}
```

### API Design Patterns
- **RESTful Endpoints**: Standard HTTP methods and status codes
- **Error Handling**: Consistent error responses with proper status codes
- **Type Validation**: Zod schemas for request/response validation
- **CORS Configuration**: Proper cross-origin setup for frontend-backend communication

### Frontend State Management
- **TanStack Query**: Server state, caching, and synchronization
- **React Hook Form**: Form state management with Zod validation
- **Context Providers**: Theme, authentication, and global state
- **Optimistic Updates**: Immediate UI feedback with background synchronization

### Component Architecture
- **shadcn/ui**: Consistent, accessible component library
- **Composition Pattern**: Flexible, reusable component design
- **CSS Variables**: Theme-aware styling with Tailwind CSS
- **Responsive Design**: Mobile-first responsive patterns

## Key Integration Points

### Frontend ↔ Backend Communication
- **API Base URL**: Configurable via environment variables
- **Request Patterns**: TanStack Query hooks for data fetching
- **Error Boundaries**: Graceful error handling and user feedback
- **Loading States**: Skeleton loaders and loading indicators

### Database ↔ Backend Integration
- **Connection Management**: Pooled connections with automatic cleanup
- **Query Patterns**: Parameterized queries to prevent SQL injection
- **Transaction Handling**: Database transactions for complex operations
- **Performance**: Indexed queries and optimized database schema

## Customization Guidelines

### Adding New Features
1. **Database Changes**: Update `database/schema.sql` and create migration
2. **Backend API**: Add API routes in `backend/app/api/`
3. **Frontend Integration**: Create hooks and components in `frontend/`
4. **Type Definitions**: Update TypeScript interfaces for type safety

### Styling Customization
- **Colors**: Modify CSS variables in `globals.css`
- **Components**: Extend shadcn/ui components or create custom ones
- **Layout**: Update Tailwind config for spacing, typography, etc.
- **Themes**: Extend theme provider for additional theme variants

### Database Schema Evolution
- **Migrations**: Create sequential SQL files for schema changes
- **Backwards Compatibility**: Ensure changes don't break existing functionality
- **Data Validation**: Use database constraints and application validation
- **Performance**: Add indexes for frequently queried columns

## Production Deployment

### Environment Configuration
- **Database**: PostgreSQL with connection pooling
- **Frontend**: Static generation with API routes
- **Backend**: Server-side rendering with API endpoints
- **Security**: Environment variables, CORS, input validation

### Docker Deployment
```bash
# Production build
docker-compose -f docker-compose.prod.yml up --build

# Individual service builds
docker build -f frontend/Dockerfile.prod -t app-frontend .
docker build -f backend/Dockerfile.prod -t app-backend .
```

## Security Best Practices

- **SQL Injection**: Always use parameterized queries
- **Input Validation**: Zod schemas for all user inputs
- **Environment Variables**: Never commit secrets to version control
- **CORS**: Properly configure allowed origins
- **Authentication**: Implement proper session management
- **File Uploads**: Validate file types and sizes

## Performance Considerations

- **Database**: Use indexes, connection pooling, query optimization
- **Frontend**: Code splitting, lazy loading, image optimization
- **Caching**: TanStack Query caching, Redis for session storage
- **Bundle Size**: Tree shaking, dynamic imports, bundle analysis

## Testing Strategy

- **Unit Tests**: Component and utility function testing
- **Integration Tests**: API endpoint testing
- **E2E Tests**: Critical user journey testing
- **Database Tests**: Schema validation and data integrity

## Troubleshooting Common Issues

### Database Connection
- Check `DATABASE_URL` format and credentials
- Verify PostgreSQL service is running
- Test connection with `psql` command line

### Frontend-Backend Communication  
- Verify CORS configuration in backend
- Check API base URL in frontend environment
- Inspect network requests in browser dev tools

### Build Issues
- Clear `.next` directories and reinstall dependencies
- Check TypeScript compilation errors
- Verify environment variables are set

---

This template provides a solid foundation for modern full-stack applications. Customize it according to your specific needs while maintaining the architectural patterns and best practices outlined above.