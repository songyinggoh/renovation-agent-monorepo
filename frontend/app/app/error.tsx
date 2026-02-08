"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
      {/* Blueprint animation */}
      <svg
        width="64"
        height="64"
        viewBox="0 0 64 64"
        className="mb-6 text-primary"
        aria-hidden="true"
      >
        <rect
          x="8"
          y="8"
          width="48"
          height="48"
          rx="4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="180"
          strokeDashoffset="180"
          className="animate-[blueprint-draw_1.5s_ease-out_forwards]"
        />
        <line
          x1="8"
          y1="24"
          x2="56"
          y2="24"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="48"
          strokeDashoffset="48"
          className="animate-[blueprint-draw_1s_ease-out_0.5s_forwards]"
        />
        <line
          x1="32"
          y1="24"
          x2="32"
          y2="56"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="32"
          strokeDashoffset="32"
          className="animate-[blueprint-draw_1s_ease-out_0.8s_forwards]"
        />
      </svg>

      <h1 className="font-display text-fluid-2xl">Something went wrong</h1>
      <p className="mt-2 max-w-md text-muted-foreground">
        We ran into an unexpected issue loading your dashboard. Please try again.
      </p>

      <div className="mt-8 flex items-center gap-4">
        <button
          onClick={reset}
          className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Try again
        </button>
        <Link
          href="/app"
          className="inline-flex items-center justify-center rounded-md border border-input bg-background px-6 py-2.5 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
