import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      {/* Blueprint grid background */}
      <div className="absolute inset-0 -z-10 bg-blueprint-grid opacity-40" />

      {/* 404 SVG with blueprint-draw animation */}
      <svg
        width="240"
        height="80"
        viewBox="0 0 240 80"
        className="mb-8 text-primary"
        aria-hidden="true"
      >
        {/* "4" left */}
        <polyline
          points="20,60 20,20 50,50 50,10 50,60"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="200"
          strokeDashoffset="200"
          className="animate-[blueprint-draw_1.2s_ease-out_forwards]"
        />
        {/* "0" */}
        <rect
          x="75"
          y="12"
          width="40"
          height="50"
          rx="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeDasharray="180"
          strokeDashoffset="180"
          className="animate-[blueprint-draw_1.2s_ease-out_0.3s_forwards]"
        />
        {/* "4" right */}
        <polyline
          points="140,60 140,20 170,50 170,10 170,60"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="200"
          strokeDashoffset="200"
          className="animate-[blueprint-draw_1.2s_ease-out_0.6s_forwards]"
        />
      </svg>

      <h1 className="font-display text-fluid-3xl">Page not found</h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>

      <Link
        href="/"
        className="mt-8 inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Back to home
      </Link>
    </div>
  );
}
