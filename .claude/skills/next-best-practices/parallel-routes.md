# Parallel & Intercepting Routes

Parallel routes render multiple pages in the same layout. Intercepting routes show different UI when navigating from within your app vs direct URL access.

## File Structure

```
app/
├── @modal/
│   ├── default.tsx            # Required! Returns null
│   └── (.)photos/[id]/
│       └── page.tsx           # Modal content
├── photos/[id]/
│   └── page.tsx               # Full page (direct access)
├── layout.tsx
└── page.tsx
```

## Root Layout with Slot

```tsx
// app/layout.tsx
export default function RootLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <html>
      <body>
        {children}
        {modal}
      </body>
    </html>
  );
}
```

## Default File (Critical!)

**Every parallel route slot MUST have a `default.tsx`**.

```tsx
// app/@modal/default.tsx
export default function Default() {
  return null;
}
```

## Modal Component

**Use `router.back()` to close modals, NOT `router.push()`.**

```tsx
'use client';
import { useRouter } from 'next/navigation';

export function Modal({ children }) {
  const router = useRouter();

  return (
    <div onClick={() => router.back()}>
      {children}
    </div>
  );
}
```

## Route Matchers

| Matcher | Matches |
|---------|---------|
| `(.)` | Same level |
| `(..)` | One level up |
| `(...)` | From root |
