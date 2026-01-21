# Socket.IO Infrastructure Implementation Plan
**Date**: 2026-01-19
**Based on Research**: [Socket_IO_Infrastructure_Research.md](../research/Socket_IO_Infrastructure_Research.md)
**Status**: 🔴 Not Started

## Overview
- **Objective**: Implement frontend Socket.io infrastructure with type-safe React hook and event definitions
- **Economic Value**: Enables real-time chat communication for renovation agent, improves user experience
- **Engines**: Frontend React components, Socket.io client, Supabase authentication
- **Agent Personas**: End users interacting with renovation chat

## Research Summary
- **Selected Approach**: Custom useChat hook with useRef pattern + type-safe event definitions (Hybrid Solution 1 + 5)
- **Key Trade-offs**:
  - More initial code vs. full control and type safety
  - No external dependencies vs. using third-party hook libraries
- **Dependencies**: socket.io-client@4.8.3 (already installed), Supabase auth session

**Why This Approach**:
- Backend Socket.io infrastructure already complete
- Follows official Socket.io + React 2025 best practices
- Full TypeScript type safety
- Integrates seamlessly with existing Supabase auth
- No additional dependencies required

---

## Implementation Strategy

### Phase 1: Type Definitions
**Goal**: Create type-safe event contracts for Socket.io communication
**Agent**: Frontend Developer
**Tools**: TypeScript

**Tasks**:
1. [ ] Task 1.1 - Create frontend types directory
   - Command: `mkdir frontend/types`

2. [ ] Task 1.2 - Create chat type definitions
   - File: `frontend/types/chat.ts`
   - Code snippet:
     ```typescript
     /**
      * Chat message structure
      */
     export interface Message {
       id: string;
       sessionId: string;
       role: 'user' | 'assistant';
       content: string;
       timestamp: string;
     }

     /**
      * Events sent from server to client
      */
     export interface ServerToClientEvents {
       'chat:session_joined': (data: { sessionId: string }) => void;
       'chat:message_ack': (data: {
         sessionId: string;
         status: string;
         timestamp: string;
       }) => void;
       'chat:assistant_token': (data: { token: string }) => void;
     }

     /**
      * Events sent from client to server
      */
     export interface ClientToServerEvents {
       'chat:join_session': (sessionId: string) => void;
       'chat:user_message': (data: {
         sessionId: string;
         content: string;
       }) => void;
     }

     /**
      * Socket.io connection events
      */
     export interface SocketEvents {
       connect: () => void;
       disconnect: () => void;
       connect_error: (error: Error) => void;
     }
     ```

**Test Specifications**:
- Unit Tests:
  - [ ] TypeScript compilation succeeds
  - [ ] Types are correctly exported
  - [ ] Event names match backend implementation

**Files to Create**:
- `frontend/types/chat.ts` - Event and message type definitions

**Files to Modify**:
- None

---

### Phase 2: useChat Hook Implementation
**Goal**: Create reusable React hook for Socket.io chat functionality
**Agent**: Frontend Developer
**Tools**: React, TypeScript, Socket.io-client

**Tasks**:
1. [ ] Task 2.1 - Create frontend hooks directory
   - Command: `mkdir frontend/hooks`

2. [ ] Task 2.2 - Implement useChat hook with connection logic
   - File: `frontend/hooks/useChat.ts`
   - Code snippet:
     ```typescript
     import { useEffect, useRef, useState } from 'react';
     import { io, Socket } from 'socket.io-client';
     import { createClient } from '@/lib/supabase/client';
     import type {
       Message,
       ServerToClientEvents,
       ClientToServerEvents,
     } from '@/types/chat';

     interface UseChatReturn {
       isConnected: boolean;
       messages: Message[];
       sendMessage: (content: string) => void;
       error: string | null;
     }

     /**
      * Custom hook for managing Socket.io chat connection
      *
      * @param sessionId - Renovation session ID to join
      * @returns Chat state and methods
      *
      * @example
      * ```tsx
      * const { isConnected, messages, sendMessage } = useChat('session-123');
      *
      * if (!isConnected) return <div>Connecting...</div>;
      *
      * return (
      *   <div>
      *     {messages.map(msg => <div key={msg.id}>{msg.content}</div>)}
      *     <button onClick={() => sendMessage('Hello')}>Send</button>
      *   </div>
      * );
      * ```
      */
     export function useChat(sessionId: string): UseChatReturn {
       const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
       const [isConnected, setIsConnected] = useState(false);
       const [messages, setMessages] = useState<Message[]>([]);
       const [error, setError] = useState<string | null>(null);

       useEffect(() => {
         // Prevent reconnection on re-renders
         if (socketRef.current) return;

         const connectSocket = async () => {
           try {
             // Get Supabase auth token
             const supabase = createClient();
             const { data: { session }, error: authError } = await supabase.auth.getSession();

             if (authError || !session?.access_token) {
               setError('Authentication required. Please sign in.');
               return;
             }

             // Create Socket.io connection
             const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
               process.env.NEXT_PUBLIC_API_URL!,
               {
                 auth: {
                   token: session.access_token,
                 },
                 transports: ['websocket', 'polling'],
                 reconnection: true,
                 reconnectionAttempts: 5,
                 reconnectionDelay: 1000,
               }
             );

             // Connection event handlers
             socket.on('connect', () => {
               console.log('[useChat] Connected to server', socket.id);
               setIsConnected(true);
               setError(null);

               // Join session room
               socket.emit('chat:join_session', sessionId);
             });

             socket.on('disconnect', (reason) => {
               console.log('[useChat] Disconnected:', reason);
               setIsConnected(false);
             });

             socket.on('connect_error', (err) => {
               console.error('[useChat] Connection error:', err.message);
               setError(`Connection failed: ${err.message}`);
               setIsConnected(false);
             });

             // Chat event handlers
             socket.on('chat:session_joined', ({ sessionId: joinedId }) => {
               console.log('[useChat] Joined session:', joinedId);
             });

             socket.on('chat:message_ack', (data) => {
               console.log('[useChat] Message acknowledged:', data);
             });

             socket.on('chat:assistant_token', (data) => {
               console.log('[useChat] Assistant token received:', data.token);
               // TODO Phase 2: Append token to streaming message
             });

             socketRef.current = socket;
           } catch (err) {
             const errorMessage = err instanceof Error ? err.message : 'Unknown error';
             console.error('[useChat] Setup error:', errorMessage);
             setError(errorMessage);
           }
         };

         connectSocket();

         // Cleanup on unmount
         return () => {
           if (socketRef.current) {
             console.log('[useChat] Cleaning up socket connection');
             socketRef.current.disconnect();
             socketRef.current = null;
           }
         };
       }, [sessionId]);

       const sendMessage = (content: string) => {
         if (!socketRef.current || !isConnected) {
           console.error('[useChat] Cannot send message: Not connected');
           setError('Not connected to chat server');
           return;
         }

         if (!content.trim()) {
           console.warn('[useChat] Cannot send empty message');
           return;
         }

         socketRef.current.emit('chat:user_message', {
           sessionId,
           content: content.trim(),
         });
       };

       return {
         isConnected,
         messages,
         sendMessage,
         error,
       };
     }
     ```

**Test Specifications**:
- Unit Tests:
  - [ ] Hook returns correct initial state (isConnected: false, messages: [], error: null)
  - [ ] Hook connects to Socket.io server with auth token
  - [ ] Hook emits 'chat:join_session' on connection
  - [ ] sendMessage emits 'chat:user_message' event
  - [ ] sendMessage validates non-empty content
  - [ ] Hook cleans up socket on unmount

- Integration Tests:
  - [ ] Full connection flow with backend server
  - [ ] Authentication rejection with invalid token
  - [ ] Room joining and event acknowledgment
  - [ ] Message sending and acknowledgment

**Files to Create**:
- `frontend/hooks/useChat.ts` - Custom Socket.io chat hook

**Files to Modify**:
- None

---

### Phase 3: Environment Configuration
**Goal**: Ensure frontend has correct API URL for Socket.io connection
**Agent**: DevOps
**Tools**: Environment variables

**Tasks**:
1. [ ] Task 3.1 - Verify NEXT_PUBLIC_API_URL in frontend/.env
   - File: `frontend/.env`
   - Expected value: `NEXT_PUBLIC_API_URL=http://localhost:3000`

2. [ ] Task 3.2 - Verify backend FRONTEND_URL for CORS
   - File: `backend/.env`
   - Expected value: `FRONTEND_URL=http://localhost:3001`

**Test Specifications**:
- Manual Tests:
  - [ ] Environment variables loaded correctly
  - [ ] CORS allows frontend connections

**Files to Create**:
- None

**Files to Modify**:
- Potentially `frontend/.env` if NEXT_PUBLIC_API_URL missing
- Potentially `backend/.env` if FRONTEND_URL missing

---

### Phase 4: Testing & Verification
**Goal**: Validate end-to-end Socket.io infrastructure
**Agent**: QA Engineer
**Tools**: Browser DevTools, Backend logs

**Tasks**:
1. [ ] Task 4.1 - Test hook in simple React component
   - Create test component:
     ```typescript
     // frontend/app/test-chat/page.tsx
     'use client';

     import { useChat } from '@/hooks/useChat';

     export default function TestChatPage() {
       const { isConnected, sendMessage, error } = useChat('test-session-123');

       return (
         <div className="p-8">
           <h1>Socket.io Test</h1>
           <p>Status: {isConnected ? '🟢 Connected' : '🔴 Disconnected'}</p>
           {error && <p className="text-red-500">Error: {error}</p>}
           <button
             onClick={() => sendMessage('Test message')}
             disabled={!isConnected}
             className="mt-4 px-4 py-2 bg-blue-500 text-white rounded"
           >
             Send Test Message
           </button>
         </div>
       );
     }
     ```

2. [ ] Task 4.2 - Manual verification checklist
   - [ ] Frontend connects to backend with valid Supabase JWT
   - [ ] Connection rejected with invalid/missing token
   - [ ] Socket joins room `session:test-session-123`
   - [ ] `chat:session_joined` event received by frontend
   - [ ] `chat:user_message` sent from frontend
   - [ ] `chat:message_ack` received by frontend
   - [ ] Backend logs show all events

3. [ ] Task 4.3 - Browser DevTools verification
   - [ ] Network tab shows WebSocket connection upgrade
   - [ ] Console shows connection logs
   - [ ] No CORS errors

4. [ ] Task 4.4 - Backend logs verification
   - [ ] "Client connected" log with userId
   - [ ] "Socket joined room session:test-session-123" log
   - [ ] "Received user message" log

**Test Specifications**:
- Manual Tests:
  - [ ] All verification steps pass
  - [ ] No console errors
  - [ ] Backend logs confirm events

**Files to Create**:
- `frontend/app/test-chat/page.tsx` - Test page (temporary, delete after verification)

**Files to Modify**:
- None

---

### Phase 5: Documentation & Cleanup
**Goal**: Document hook usage and remove test artifacts
**Agent**: Technical Writer
**Tools**: Markdown, JSDoc

**Tasks**:
1. [ ] Task 5.1 - Add JSDoc comments to useChat hook (already included in Phase 2)
   - ✅ Already has comprehensive JSDoc with example

2. [ ] Task 5.2 - Update CLAUDE.md with hook usage
   - File: `CLAUDE.md`
   - Add section:
     ```markdown
     ### Frontend Hooks
     - `useChat(sessionId)` - Socket.io chat connection hook (see `frontend/hooks/useChat.ts`)
       - Returns: `{ isConnected, messages, sendMessage, error }`
       - Automatically connects on mount, disconnects on unmount
       - Handles Supabase JWT authentication
     ```

3. [ ] Task 5.3 - Remove test page
   - Delete: `frontend/app/test-chat/page.tsx`

**Test Specifications**:
- Manual Tests:
  - [ ] Documentation accurate and helpful
  - [ ] No test artifacts remain in codebase

**Files to Create**:
- None

**Files to Modify**:
- `CLAUDE.md` - Add hook documentation

**Files to Delete**:
- `frontend/app/test-chat/page.tsx` - Test page

---

## Success Metrics

### Technical
- ✅ Test coverage ≥80% (when unit tests added in future phase)
- ✅ 0 TypeScript errors
- ✅ 0 ESLint errors
- ✅ All quality gates passing
- ✅ WebSocket connection successful
- ✅ All events properly typed

### Business
- ✅ Real-time chat functional
- ✅ Authentication secure (JWT verification)
- ✅ User can join session and send messages
- ✅ Messages acknowledged by server

---

## Quality Gates

### Pre-Implementation
- [x] Research document complete
- [x] Implementation plan reviewed
- [ ] User approval received

### During Implementation
- [ ] TypeScript compilation successful (`npm run type-check`)
- [ ] ESLint passing (`npm run lint`)
- [ ] No `any` types in new code
- [ ] Structured logging used (no `console.log` in production code)
- [ ] All event names match backend exactly

### Pre-Commit
- [ ] All manual tests passing
- [ ] Backend logs confirm events received
- [ ] No CORS errors
- [ ] No authentication errors with valid token
- [ ] Documentation updated

---

## Rollback Plan

If issues occur during implementation:

1. **Phase 1 Issues** (Type definitions)
   - Delete `frontend/types/chat.ts`
   - No impact on existing code

2. **Phase 2 Issues** (Hook implementation)
   - Delete `frontend/hooks/useChat.ts`
   - Backend remains functional
   - No breaking changes

3. **Phase 4 Issues** (Testing failures)
   - Review backend logs for error messages
   - Check CORS configuration
   - Verify Supabase token validity
   - Check NEXT_PUBLIC_API_URL environment variable

**Zero Backend Changes Required**: Backend Socket.io infrastructure is complete and production-ready. All changes are frontend-only and non-breaking.

---

## Future Enhancements

Phase 2+ (Future):
- [ ] Add message persistence (store in messages state)
- [ ] Handle `chat:assistant_token` streaming
- [ ] Add reconnection toast notifications
- [ ] Add typing indicators
- [ ] Add read receipts
- [ ] Unit tests with React Testing Library
- [ ] E2E tests with Playwright

---

## Implementation Notes

### Backend Status
✅ **Already Complete** - No backend changes needed:
- Socket.io server configured with JWT auth
- Room-based session management
- Event handlers for `chat:join_session` and `chat:user_message`
- Graceful shutdown handling
- Comprehensive logging

### Frontend Work Required
🔴 **To Implement**:
1. Type definitions (`frontend/types/chat.ts`)
2. useChat hook (`frontend/hooks/useChat.ts`)
3. Environment variable verification
4. Manual testing
5. Documentation updates

### Estimated Timeline
- Phase 1: 30 minutes (Type definitions)
- Phase 2: 1-2 hours (Hook implementation)
- Phase 3: 15 minutes (Environment verification)
- Phase 4: 1 hour (Testing)
- Phase 5: 30 minutes (Documentation)

**Total**: ~3-4 hours

---

## Dependencies Checklist
- [x] Backend Socket.io server running
- [x] `socket.io-client@4.8.3` installed
- [x] Supabase auth configured
- [x] `verifyToken` function exported from auth middleware
- [ ] `NEXT_PUBLIC_API_URL` set in `frontend/.env`
- [ ] `FRONTEND_URL` set in `backend/.env`
