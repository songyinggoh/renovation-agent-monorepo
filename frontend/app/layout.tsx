import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "react-hot-toast";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Your App Name",
  description: "Your app description",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.variable}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            <div className="min-h-screen bg-background font-sans antialiased">
              <header className="border-b">
                <div className="container mx-auto px-4 py-4">
                  <h1 className="text-2xl font-bold">Your App</h1>
                </div>
              </header>
              <main>{children}</main>
              <footer className="border-t mt-12">
                <div className="container mx-auto px-4 py-8 text-center text-muted-foreground">
                  <p>&copy; 2024 Your App. All rights reserved.</p>
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