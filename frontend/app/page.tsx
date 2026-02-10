'use client';

import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles,
  MessageSquare,
  Calculator,
  ClipboardCheck,
  Paintbrush,
  Home,
  DollarSign,
  ArrowRight,
} from 'lucide-react';

const features = [
  {
    icon: MessageSquare,
    title: 'AI Chat Assistant',
    description:
      'Get instant answers to your renovation questions with our intelligent AI assistant.',
  },
  {
    icon: Calculator,
    title: 'Smart Budgeting',
    description:
      'Track costs and get budget recommendations tailored to your project scope.',
  },
  {
    icon: ClipboardCheck,
    title: 'Room-by-Room Planning',
    description:
      'Organize your renovation with detailed checklists for every room.',
  },
  {
    icon: Paintbrush,
    title: 'Design Suggestions',
    description:
      'Receive personalized design ideas based on your style and budget.',
  },
  {
    icon: Home,
    title: 'Contractor Matching',
    description:
      'Find and compare trusted contractors for your specific project needs.',
  },
  {
    icon: DollarSign,
    title: 'Payment Tracking',
    description:
      'Manage payments and milestones to keep your project on track.',
  },
];

const steps = [
  {
    number: '1',
    title: 'Describe Your Project',
    description: 'Tell our AI about your renovation goals, budget, and timeline.',
  },
  {
    number: '2',
    title: 'Get Your Plan',
    description: 'Receive a detailed renovation plan with room-by-room breakdowns.',
  },
  {
    number: '3',
    title: 'Execute with Confidence',
    description: 'Follow your plan, track progress, and manage contractors in one place.',
  },
];

export default function HomePage() {
  const supabase = createClient();

  const handleSignIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 via-background to-accent/10">
        <div className="container mx-auto px-4 py-24 text-center sm:py-32">
          <Badge variant="secondary" className="mb-6 gap-1.5 px-3 py-1 text-sm animate-slide-up">
            <Sparkles className="h-3.5 w-3.5" />
            AI-Powered Renovation Planning
          </Badge>
          <h1 className="text-fluid-4xl animate-slide-up [animation-delay:100ms] [animation-fill-mode:backwards]">
            Plan Your Dream
            <br />
            Renovation with AI
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground animate-slide-up [animation-delay:200ms] [animation-fill-mode:backwards]">
            From concept to completion, our intelligent assistant helps you plan
            smarter, budget better, and execute with confidence.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row animate-slide-up [animation-delay:300ms] [animation-fill-mode:backwards]">
            <Button size="lg" onClick={handleSignIn} className="gap-2">
              Get Started Free
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="#features">See Features</a>
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="container mx-auto px-4 py-24 bg-blueprint-grid">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-fluid-3xl">
            Everything You Need to Renovate
          </h2>
          <p className="mt-4 text-muted-foreground">
            Powerful tools designed to simplify every step of your renovation
            journey.
          </p>
        </div>
        <div className="mx-auto mt-16 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title} className="transition-all duration-200 hover:shadow-md hover:scale-[1.02]">
              <CardContent className="pt-6">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {feature.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-muted/40 py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-fluid-3xl">
              How It Works
            </h2>
            <p className="mt-4 text-muted-foreground">
              Three simple steps to your perfect renovation plan.
            </p>
          </div>
          <div className="mx-auto mt-16 grid max-w-4xl gap-8 sm:grid-cols-3">
            {steps.map((step) => (
              <div key={step.number} className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
                  {step.number}
                </div>
                <h3 className="mt-4 font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="container mx-auto px-4 py-24">
        <Card className="mx-auto max-w-3xl overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-background to-accent/10">
          <CardContent className="py-12 text-center">
            <h2 className="text-fluid-3xl">
              Ready to Start Your Renovation?
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
              Join homeowners who plan smarter with AI. Sign in to get your
              personalized renovation plan today.
            </p>
            <Button size="lg" onClick={handleSignIn} className="mt-8 gap-2">
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Sign in with Google
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
