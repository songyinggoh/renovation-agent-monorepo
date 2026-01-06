import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Admin Dashboard",
  description: "Backend administration interface",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.variable}>
        <div className="min-h-screen bg-background font-sans antialiased">
          <nav className="border-b bg-background">
            <div className="flex h-16 items-center px-4">
              <h1 className="text-xl font-semibold">Admin Dashboard</h1>
            </div>
          </nav>
          <main className="flex-1 space-y-4 p-8 pt-6">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}