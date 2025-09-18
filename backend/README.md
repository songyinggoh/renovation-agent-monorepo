# Backend - Admin/API Application

Backend Next.js application providing admin dashboard and API endpoints with PostgreSQL database integration.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Setup database
npm run db:migrate
npm run db:seed

# Start development server
npm run dev
```

Visit http://localhost:3000

## 📁 Project Structure

```
backend/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # Admin layout
│   ├── page.tsx           # Dashboard home
│   ├── globals.css        # Global styles
│   ├── api/               # API routes
│   │   └── items/         # Example CRUD endpoints
│   └── dashboard/         # Admin pages
├── components/            # Admin UI components
├── lib/                   # Server utilities
│   └── db.ts             # Database connection
├── scripts/               # Database scripts
└── types/                 # TypeScript definitions
```

## 🛠️ Available Scripts

- `npm run dev` - Start development server on port 3000
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript compiler
- `npm run db:migrate` - Run database migrations
- `npm run db:seed` - Seed database with sample data

## 🗄️ Database Integration

### Connection Setup
PostgreSQL connection with pooling:

```typescript
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function query(text: string, params?: any[]) {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}
```

### Example Operations
```typescript
// Get all items
export async function getAllItems() {
  const result = await query('SELECT * FROM items ORDER BY created_at DESC');
  return result.rows;
}

// Create item
export async function createItem(data: CreateItemData) {
  const result = await query(
    'INSERT INTO items (name, description) VALUES ($1, $2) RETURNING *',
    [data.name, data.description]
  );
  return result.rows[0];
}
```

## 🔧 Configuration

### Environment Variables (.env.local)
```env
# Database
DATABASE_URL=postgresql://username:password@localhost:5432/database

# Authentication
JWT_SECRET=your-jwt-secret
AUTH_SECRET=your-auth-secret

# API Configuration
API_BASE_URL=http://localhost:3000
FRONTEND_URL=http://localhost:3001
```

### Database Schema
Located in `../database/schema.sql`:
- Users, items, categories, orders tables
- Indexes for performance
- Triggers for updated_at timestamps

## 📡 API Endpoints

### RESTful API Design
```typescript
// app/api/items/route.ts
export async function GET() {
  try {
    const items = await getAllItems();
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch items' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const item = await createItem(data);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create item' },
      { status: 500 }
    );
  }
}
```

### API Routes Structure
- `GET /api/items` - List all items
- `POST /api/items` - Create new item
- `GET /api/items/[id]` - Get specific item
- `PUT /api/items/[id]` - Update item
- `DELETE /api/items/[id]` - Delete item

## 🎯 Development Guidelines

### Database Best Practices
- Always use parameterized queries
- Implement proper error handling
- Use database transactions for complex operations
- Add indexes for frequently queried columns

### API Design
- Follow REST conventions
- Return consistent error responses
- Implement proper HTTP status codes
- Add request validation with Zod

### Security
- Validate all inputs
- Use environment variables for secrets
- Implement proper authentication
- Set up CORS for frontend communication

## 🚀 Deployment

### Production Build
```bash
npm run build
npm run start
```

### Docker
```bash
docker build -t backend .
docker run -p 3000:3000 backend
```

### Database Migration
```bash
# Production database setup
psql $DATABASE_URL < ../database/schema.sql
```

## 🔍 Troubleshooting

### Database Issues
1. **Connection errors**: Check DATABASE_URL format
2. **Query failures**: Verify table schema matches code
3. **Performance**: Add indexes for slow queries

### API Issues
1. **CORS errors**: Check frontend URL configuration
2. **404 errors**: Verify API route file structure
3. **500 errors**: Check server logs and error handling

### Development Issues
1. **Port conflicts**: Change port in package.json
2. **Environment variables**: Ensure .env.local is configured
3. **Type errors**: Check database type definitions

## 🔧 Database Management

### Migrations
Create new migration files in sequence:
```sql
-- migrations/001_initial.sql
-- migrations/002_add_categories.sql
```

### Backup and Restore
```bash
# Backup
pg_dump $DATABASE_URL > backup.sql

# Restore
psql $DATABASE_URL < backup.sql
```

## 📚 Resources

- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [node-postgres (pg)](https://node-postgres.com/)
- [Database Design Best Practices](https://www.postgresql.org/docs/current/ddl-best-practices.html)