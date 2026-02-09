"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function SessionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Session error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
      {/* Building animation */}
      <div className="mb-6 flex items-end justify-center gap-1 h-16" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-4 bg-primary/60 rounded-t animate-[blocks-stack_0.6s_ease-out_forwards]"
            style={{
              height: `${(i + 1) * 16}px`,
              animationDelay: `${i * 200}ms`,
              animationFillMode: "backwards",
            }}
          />
        ))}
      </div>

      <h1 className="font-display text-fluid-2xl">
        We hit a snag with your renovation session
      </h1>
      <p className="mt-2 max-w-md text-muted-foreground">
        Something went wrong loading this session. Your progress is safe — try
        reloading, or head back to the dashboard.
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
