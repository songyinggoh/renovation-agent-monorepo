'use client';

import { useChat } from '@/hooks/useChat';
import { useState } from 'react';

export default function TestChatPage() {
  const { isConnected, sendMessage, error } = useChat('test-session-123');
  const [messageInput, setMessageInput] = useState('');

  const handleSend = () => {
    if (messageInput.trim()) {
      sendMessage(messageInput);
      setMessageInput('');
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Socket.io Test Page</h1>

      {/* Connection Status */}
      <div className="mb-6 p-4 rounded-lg border">
        <h2 className="text-xl font-semibold mb-2">Connection Status</h2>
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="font-medium">
            {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
          </span>
        </div>
        {error && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            <strong>Error:</strong> {error}
          </div>
        )}
      </div>

      {/* Test Instructions */}
      <div className="mb-6 p-4 rounded-lg bg-blue-50 border border-blue-200">
        <h2 className="text-xl font-semibold mb-2 text-blue-900">Test Instructions</h2>
        <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
          <li>Ensure backend is running on <code>http://localhost:3000</code></li>
          <li>Sign in with Google to get Supabase JWT token</li>
          <li>Check connection status above (should be 🟢 Connected)</li>
          <li>Open browser DevTools console to see logs</li>
          <li>Send a test message using the input below</li>
          <li>Check backend logs for "Received user message"</li>
        </ol>
      </div>

      {/* Message Input */}
      <div className="mb-6 p-4 rounded-lg border">
        <h2 className="text-xl font-semibold mb-4">Send Test Message</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type a test message..."
            disabled={!isConnected}
            className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSend}
            disabled={!isConnected || !messageInput.trim()}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
        <p className="mt-2 text-sm text-gray-600">
          {isConnected
            ? 'Enter a message and click Send or press Enter'
            : 'Connect to chat server first'}
        </p>
      </div>

      {/* Expected Events */}
      <div className="p-4 rounded-lg bg-gray-50 border">
        <h2 className="text-xl font-semibold mb-2">Expected Events (Check Console)</h2>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
          <li><code>[useChat] Connected to server</code></li>
          <li><code>[useChat] Joined session: test-session-123</code></li>
          <li><code>[useChat] Message acknowledged</code> (after sending)</li>
        </ul>
      </div>

      {/* Backend Verification */}
      <div className="mt-6 p-4 rounded-lg bg-yellow-50 border border-yellow-200">
        <h2 className="text-xl font-semibold mb-2 text-yellow-900">Backend Logs to Check</h2>
        <ul className="list-disc list-inside space-y-1 text-sm text-yellow-800">
          <li>Client connected (with socketId and userId)</li>
          <li>Socket joined room session:test-session-123</li>
          <li>Received user message (with sessionId and contentLength)</li>
        </ul>
      </div>
    </div>
  );
}
