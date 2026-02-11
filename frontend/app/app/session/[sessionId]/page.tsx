import { SessionPageClient } from '@/components/session/session-page-client';

interface SessionPageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function SessionPage({ params }: SessionPageProps) {
  const { sessionId } = await params;
  return <SessionPageClient sessionId={sessionId} />;
}
