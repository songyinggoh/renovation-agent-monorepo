import type { Metadata, Viewport } from "next";
import { fontVariables } from "@/lib/fonts";
import "./globals.css";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "react-hot-toast";

import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://renovationagent.com"
  ),
  title: {
    default: "Renovation Agent",
    template: "%s | Renovation Agent",
  },
  description:
    "AI-powered renovation planning assistant. Plan your dream renovation with intelligent room-by-room guidance, smart budgeting, and contractor matching.",
  openGraph: {
    type: "website",
    siteName: "Renovation Agent",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
  },
  icons: {
    icon: "/icon",
    apple: "/apple-icon",
  },
};

export const viewport: Viewport = {
  themeColor: "#b85a32",
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={fontVariables}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            <div className="min-h-screen bg-background font-sans antialiased flex flex-col">
              {/* Header */}
              <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
                <div className="container mx-auto flex h-16 items-center justify-between px-4">
                  <span className="font-display text-xl tracking-tight">Renovation Agent</span>
                  <ThemeToggle />
                </div>
              </header>

              {/* Main content */}
              <main className="flex-1">{children}</main>

              {/* Footer */}
              <footer className="border-t bg-muted/40">
                <div className="container mx-auto px-4 py-12">
                  <div className="grid gap-8 md:grid-cols-3">
                    <div>
                      <span className="font-display text-base tracking-tight">Renovation Agent</span>
                      <p className="mt-3 text-sm text-muted-foreground">
                        AI-powered renovation planning. From concept to
                        completion, we help you plan smarter.
                      </p>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold">Product</h3>
                      <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                        <li>Features</li>
                        <li>Pricing</li>
                        <li>How It Works</li>
                      </ul>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold">Legal</h3>
                      <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                        <li>Privacy Policy</li>
                        <li>Terms of Service</li>
                        <li>Contact</li>
                      </ul>
                    </div>
                  </div>
                  <Separator className="my-8" />
                  <p className="text-center text-sm text-muted-foreground">
                    &copy; {new Date().getFullYear()} Renovation Agent. All
                    rights reserved.
                  </p>
                </div>
              </footer>
            </div>
            <Toaster position="bottom-right" />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
