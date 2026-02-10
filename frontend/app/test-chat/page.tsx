'use client';

import { useChat } from '@/hooks/useChat';
import { useState } from 'react';

export default function TestChatPage() {
  const { isConnected, sendMessage, error, messages, isAssistantTyping } = useChat('test-session-123');
  const [messageInput, setMessageInput] = useState('');

  const handleSend = () => {
    if (messageInput.trim()) {
      sendMessage(messageInput);
      setMessageInput('');
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-fluid-2xl font-bold mb-6">Socket.io Test Page</h1>

      {/* Connection Status */}
      <div className="mb-6 p-4 rounded-lg border border-border">
        <h2 className="text-xl font-semibold mb-2">Connection Status</h2>
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-success' : 'bg-destructive'}`} />
          <span className="font-medium">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        {error && (
          <div className="mt-2 p-2 bg-destructive/10 border border-destructive/20 rounded text-destructive text-sm">
            <strong>Error:</strong> {error}
          </div>
        )}
      </div>

      {/* Test Instructions */}
      <div className="mb-6 p-4 rounded-lg bg-primary/5 border border-primary/20">
        <h2 className="text-xl font-semibold mb-2">Test Instructions</h2>
        <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
          <li>Ensure backend is running on <code>http://localhost:3000</code></li>
          <li>Sign in with Google to get Supabase JWT token</li>
          <li>Check connection status above (should be Connected)</li>
          <li>Open browser DevTools console to see logs</li>
          <li>Send a test message using the input below</li>
          <li>Check backend logs for &quot;Received user message&quot;</li>
        </ol>
      </div>

      {/* Messages Display */}
      <div className="mb-6 p-4 rounded-lg border border-border">
        <h2 className="text-xl font-semibold mb-4">Messages</h2>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {messages.length === 0 ? (
            <p className="text-muted-foreground text-sm italic">No messages yet. Send a message to test streaming!</p>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`p-3 rounded-lg ${
                  msg.role === 'user'
                    ? 'bg-primary/10 ml-8'
                    : 'bg-muted mr-8'
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="font-semibold text-sm">
                    {msg.role === 'user' ? 'You' : 'Assistant'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(msg.created_at).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              </div>
            ))
          )}
          {isAssistantTyping && (
            <div className="p-3 rounded-lg bg-muted mr-8">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">Assistant</span>
                <span className="text-xs text-muted-foreground">typing...</span>
              </div>
              <div className="flex gap-1 mt-2">
                <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Message Input */}
      <div className="mb-6 p-4 rounded-lg border border-border">
        <h2 className="text-xl font-semibold mb-4">Send Test Message</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type a test message..."
            disabled={!isConnected}
            className="flex-1 px-4 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-muted disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSend}
            disabled={!isConnected || !messageInput.trim()}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {isConnected
            ? 'Enter a message and click Send or press Enter'
            : 'Connect to chat server first'}
        </p>
      </div>

      {/* Expected Events */}
      <div className="p-4 rounded-lg bg-muted border border-border">
        <h2 className="text-xl font-semibold mb-2">Expected Events (Check Console)</h2>
        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
          <li><code>[useChat] Connected to server</code></li>
          <li><code>[useChat] Joined session: test-session-123</code></li>
          <li><code>[useChat] Message acknowledged</code> (after sending)</li>
        </ul>
      </div>

      {/* Backend Verification */}
      <div className="mt-6 p-4 rounded-lg bg-warning/10 border border-warning/30">
        <h2 className="text-xl font-semibold mb-2">Backend Logs to Check</h2>
        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
          <li>Client connected (with socketId and userId)</li>
          <li>Socket joined room session:test-session-123</li>
          <li>Received user message (with sessionId and contentLength)</li>
        </ul>
      </div>
    </div>
  );
}
