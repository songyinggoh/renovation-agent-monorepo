'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { User } from '@supabase/supabase-js';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { LoadingState } from '@/components/ui/loading-state';
import { Menu, LogOut } from 'lucide-react';

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const supabase = useMemo(() => createClient(), []);

    useEffect(() => {
        const checkUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                // Allow anonymous access when Supabase is not configured (Phases 1-7)
                if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
                    setLoading(false);
                    return;
                }
                router.push('/');
            } else {
                setUser(user);
            }
            setLoading(false);
        };

        checkUser();
    }, [router, supabase.auth]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <LoadingState variant="blueprint" message="Preparing your workspace..." />
            </div>
        );
    }

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push('/');
    };

    return (
        <div className="min-h-screen bg-background">
            <nav className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-md">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="flex h-16 items-center justify-between">
                        {/* Left: Logo */}
                        <span className="font-display text-base tracking-tight">Renovation Agent</span>

                        {/* Right: Desktop nav */}
                        <div className="hidden items-center gap-4 sm:flex">
                            {user && (
                                <span className="text-sm text-muted-foreground">
                                    {user.email}
                                </span>
                            )}
                            <ThemeToggle />
                            {user && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleSignOut}
                                    className="gap-2"
                                >
                                    <LogOut className="h-4 w-4" />
                                    Sign out
                                </Button>
                            )}
                        </div>

                        {/* Right: Mobile hamburger */}
                        <div className="flex items-center gap-2 sm:hidden">
                            <ThemeToggle />
                            <Sheet>
                                <SheetTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-9 w-9">
                                        <Menu className="h-5 w-5" />
                                        <span className="sr-only">Open menu</span>
                                    </Button>
                                </SheetTrigger>
                                <SheetContent side="right" className="w-72">
                                    <div className="flex flex-col gap-6 pt-6">
                                        <span className="font-display text-base tracking-tight">Renovation Agent</span>
                                        {user && (
                                            <p className="text-sm text-muted-foreground">
                                                {user.email}
                                            </p>
                                        )}
                                        {user && (
                                            <Button
                                                variant="outline"
                                                onClick={handleSignOut}
                                                className="gap-2"
                                            >
                                                <LogOut className="h-4 w-4" />
                                                Sign out
                                            </Button>
                                        )}
                                    </div>
                                </SheetContent>
                            </Sheet>
                        </div>
                    </div>
                </div>
            </nav>
            <main className="py-10 surface-dashboard">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
