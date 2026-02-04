import { ChatView } from '@/components/chat/chat-view';

interface ChatPageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function ChatPage({ params }: ChatPageProps) {
  const { sessionId } = await params;
  return <ChatView sessionId={sessionId} />;
}
