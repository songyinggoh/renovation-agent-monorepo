# Frontend - Customer Application

Customer-facing Next.js application with modern UI/UX, built with TypeScript, Tailwind CSS, and shadcn/ui components.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Start development server
npm run dev
```

Visit http://localhost:3001

## 📁 Project Structure

```
frontend/
├── app/                     # Next.js App Router
│   ├── layout.tsx          # Root layout with providers
│   ├── page.tsx            # Homepage
│   ├── globals.css         # Global styles
│   └── api/                # API routes (if needed)
├── components/             # React components
│   ├── ui/                 # shadcn/ui components
│   └── providers/          # Context providers
├── lib/                    # Utilities
├── hooks/                  # Custom React hooks
├── types/                  # TypeScript definitions
└── public/                 # Static assets
```

## 🛠️ Available Scripts

- `npm run dev` - Start development server on port 3001
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript compiler

## 🎨 UI Components

This project uses [shadcn/ui](https://ui.shadcn.com/) for consistent, accessible components:

```bash
# Add new shadcn/ui components
npx shadcn-ui@latest add [component-name]
```

## 🔧 Configuration

### Environment Variables (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:3000
# Add your environment variables here
```

### Tailwind CSS
- Custom design system with CSS variables
- Dark mode support
- Responsive design utilities
- Located in `tailwind.config.ts`

### shadcn/ui Configuration
- Configuration in `components.json`
- Components installed in `components/ui/`
- Customizable theme and styling

## 📡 API Integration

### TanStack Query
Server state management with caching:

```typescript
// Example hook
import { useQuery } from '@tanstack/react-query';

export function useItems() {
  return useQuery({
    queryKey: ['items'],
    queryFn: () => fetch('/api/items').then(res => res.json()),
  });
}
```

### Form Handling
React Hook Form with Zod validation:

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
});

export function MyForm() {
  const form = useForm({
    resolver: zodResolver(schema),
  });
  // ...
}
```

## 🎯 Development Guidelines

### Component Structure
- Use TypeScript for all components
- Follow shadcn/ui patterns for consistency
- Implement proper error boundaries
- Use proper loading states

### Styling
- Use Tailwind CSS classes
- Follow the design system variables
- Implement responsive design
- Support dark mode

### State Management
- Use TanStack Query for server state
- Use React Hook Form for form state
- Use Context for global client state
- Avoid prop drilling

## 🚀 Deployment

### Build
```bash
npm run build
```

### Docker
```bash
docker build -t frontend .
docker run -p 3001:3001 frontend
```

### Production Environment Variables
Set the following in production:
- `NEXT_PUBLIC_API_URL` - Backend API URL
- Add authentication and payment variables as needed

## 🔍 Troubleshooting

### Common Issues
1. **Build errors**: Check TypeScript compilation
2. **API calls failing**: Verify NEXT_PUBLIC_API_URL
3. **Styling issues**: Check Tailwind configuration
4. **Component not found**: Ensure shadcn/ui component is installed

### Debug Tools
- React Developer Tools
- TanStack Query Devtools (enabled in development)
- Next.js built-in debugging

## 📚 Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [shadcn/ui Components](https://ui.shadcn.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [TanStack Query](https://tanstack.com/query/latest)
- [React Hook Form](https://react-hook-form.com/)