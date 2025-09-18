# Website Template Monorepo

A modern, production-ready monorepo template for full-stack web applications with frontend, backend, and database integration. Based on proven patterns from production wine business applications.

## 🏗️ Architecture Overview

This template provides a complete monorepo structure with:
- **Frontend**: Customer-facing Next.js application with modern UI/UX
- **Backend**: Admin/API Next.js application with database integration
- **Database**: PostgreSQL with schema and migration templates
- **Shared Infrastructure**: Docker, deployment configs, and development tools

## 🚀 Tech Stack

### Frontend (Customer App)
- **Next.js 15** with App Router & TypeScript
- **Tailwind CSS** for styling with custom design system
- **shadcn/ui** component library (Radix UI based)
- **TanStack Query v5** for server state management
- **React Hook Form + Zod** for form validation
- **Stripe** integration for payments
- **Lucide React** for icons

### Backend (Admin/API App)
- **Next.js 15** with App Router & TypeScript
- **Database Integration** with direct SQL queries
- **Authentication** system ready
- **API Routes** for CRUD operations
- **File Upload** capabilities
- **Admin Dashboard** components

### Database & Infrastructure
- **PostgreSQL** database with migration scripts
- **Docker** containerization for all services
- **Google Cloud** deployment configurations
- **Supabase** integration template (optional)
- **Environment configuration** templates

## 📁 Project Structure

```
website-template-monorepo/
├── frontend/                    # Customer-facing Next.js app
│   ├── app/                     # Next.js App Router pages
│   ├── components/              # Reusable UI components
│   ├── lib/                     # Utilities and configurations
│   ├── hooks/                   # Custom React hooks
│   └── types/                   # TypeScript type definitions
├── backend/                     # Admin/API Next.js app
│   ├── app/                     # Admin dashboard and API routes
│   ├── components/              # Admin UI components
│   ├── lib/                     # Database and server utilities
│   └── scripts/                 # Database scripts and utilities
├── database/                    # Database schema and migrations
│   ├── schema.sql              # Database schema definition
│   ├── seed.sql                # Sample data for development
│   └── migrations/             # Database migration scripts
└── docs/                       # Documentation and guides
```

## 🛠️ Quick Start

### Prerequisites
- Node.js 18+ and npm
- PostgreSQL database
- Docker (optional, for containerized development)

### 1. Clone and Setup
```bash
# Clone the template
git clone <your-repo-url>
cd website-template-monorepo

# Install dependencies for frontend
cd frontend
npm install

# Install dependencies for backend
cd ../backend
npm install
```

### 2. Environment Configuration
```bash
# Copy environment templates
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env.local

# Edit the .env.local files with your configurations
```

### 3. Database Setup
```bash
# Run database migrations
cd backend
npm run db:migrate

# Seed with sample data (optional)
npm run db:seed
```

### 4. Development
```bash
# Terminal 1: Start frontend (port 3001)
cd frontend
npm run dev

# Terminal 2: Start backend (port 3000)
cd backend
npm run dev
```

Visit:
- Frontend: http://localhost:3001
- Backend/Admin: http://localhost:3000

## 🎨 Design System

The template includes a complete design system built with:
- **Tailwind CSS** with custom color palette and spacing
- **shadcn/ui** components with consistent styling
- **Typography** system with custom fonts
- **Responsive** design patterns
- **Dark mode** support

## 🗄️ Database Architecture

- **Direct SQL** approach (no ORM) for optimal performance
- **PostgreSQL** with modern features
- **Migration system** for schema changes
- **Type-safe** database queries with TypeScript
- **Connection pooling** and optimization

## 🚀 Deployment

### Docker Deployment
```bash
# Build and run with Docker Compose
docker-compose up --build
```

### Cloud Platform
- **Google Cloud Run** configurations included
- **Supabase** integration templates
- **Vercel** deployment ready
- **Environment variables** templates for production

## 📚 Documentation

- [Frontend Development Guide](./frontend/README.md)
- [Backend Development Guide](./backend/README.md)
- [Database Schema Guide](./database/README.md)
- [Deployment Guide](./docs/DEPLOYMENT.md)
- [Contributing Guide](./docs/CONTRIBUTING.md)

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This template is MIT licensed. Use it freely for your projects!

## 🆘 Support

- Check the [documentation](./docs/)
- Review [CLAUDE.md](./CLAUDE.md) for AI assistant guidance
- Open an issue for bugs or feature requests

---

**Happy coding!** 🎉 This template is designed to get you up and running quickly with a modern, scalable web application architecture.