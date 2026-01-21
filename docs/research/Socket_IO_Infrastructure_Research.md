# Socket.IO Infrastructure Research
**Date**: 2026-01-19
**Author**: Claude Code
**Status**: Complete

## Problem Statement

Implement robust Socket.io infrastructure for the renovation agent to enable real-time communication between the frontend and backend, including:
- Secure authentication via Supabase JWT
- Room-based session management
- Event handlers for chat interactions
- Frontend React hook for managing WebSocket connections
- Type-safe event definitions

## Current State Analysis

### Backend Implementation (✅ Already Complete)

The backend has a comprehensive Socket.io setup in `backend/src/server.ts` with:

**Relevant Files:**
- `backend/src/server.ts:95-202` - Socket.io server setup with auth, room management, events
- `backend/src/middleware/auth.middleware.ts:18-29` - Token verification function (already exported and reusable)
- `backend/src/config/env.ts` - Environment configuration with FRONTEND_URL for CORS

**Current Socket.io Configuration:**
```typescript
// backend/src/server.ts:96-107
io = new SocketIOServer(httpServer, {
  cors: {
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,       // 60 seconds
  pingInterval: 25000,      // 25 seconds
  maxHttpBufferSize: 10e6,  // 10 MB for images
});
```

**Authentication Middleware (✅ Already Implemented):**
```typescript
// backend/src/server.ts:110-125
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error: Token required'));
    }
    const user = await verifyToken(token);
    (socket as any).user = user;
    next();
  } catch (err) {
    logger.error('Socket authentication failed', err as Error);
    next(new Error('Authentication error: Invalid token'));
  }
});
```

**Event Handlers (✅ Already Implemented):**
- `connection` - Logs client connection with userId
- `chat:join_session` - Joins room `session:<sessionId>`, emits `chat:session_joined`
- `chat:user_message` - Receives messages, validates room membership, emits `chat:message_ack`
- `disconnect` - Logs disconnection reason

**Graceful Shutdown (✅ Already Implemented):**
- Socket.io cleanup registered in ShutdownManager (3s timeout)

### Frontend Implementation (❌ Missing)

**Current State:**
- `socket.io-client@4.8.3` installed in `frontend/package.json`
- No `frontend/hooks/` directory exists
- No `frontend/types/` directory exists
- No `useChat` hook implemented
- No Socket event type definitions

**Required Implementation:**
1. `frontend/hooks/useChat.ts` - Custom hook for Socket.io connection
2. `frontend/types/chat.ts` - TypeScript type definitions

---

## Solution Vectors Evaluated

### Solution 1: Custom useChat Hook with useRef Pattern (Recommended)
**Fit Score**: 9/10

**Pros**:
- Full control over connection lifecycle
- Follows official Socket.io React best practices (2025)
- useRef prevents recreation on re-renders
- Clean separation of concerns
- Type-safe with TypeScript
- Integrates with existing Supabase auth
- No external dependencies beyond socket.io-client

**Cons**:
- Need to write custom hook (more initial code)
- Manual cleanup required in useEffect

**Complexity**: Medium
**Cost**: Minimal (uses existing dependencies)
**Time**: Quick (2-3 hours)

**Code Snippet**:
```typescript
// frontend/hooks/useChat.ts
import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { createClient } from '@/lib/supabase/client';

interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export const useChat = (sessionId: string) => {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    const connectSocket = async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        console.error('No auth token available');
        return;
      }

      const socket = io(process.env.NEXT_PUBLIC_API_URL!, {
        auth: { token: session.access_token },
        transports: ['websocket', 'polling'],
      });

      socket.on('connect', () => {
        setIsConnected(true);
        socket.emit('chat:join_session', sessionId);
      });

      socket.on('chat:session_joined', ({ sessionId: joinedId }) => {
        console.log('Joined session:', joinedId);
      });

      socket.on('chat:message_ack', (data) => {
        console.log('Message acknowledged:', data);
      });

      socket.on('disconnect', () => setIsConnected(false));

      socketRef.current = socket;
    };

    connectSocket();

    return () => {
      socketRef.current?.disconnect();
    };
  }, [sessionId]);

  const sendMessage = (content: string) => {
    socketRef.current?.emit('chat:user_message', { sessionId, content });
  };

  return { isConnected, messages, sendMessage };
};
```

**Files to Create**:
- `frontend/hooks/useChat.ts` - Custom hook (above)
- `frontend/types/chat.ts` - Type definitions

**Files to Modify**:
- None (backend already complete)

---

### Solution 2: Third-Party Hook Library (socket.io-react-hook)
**Fit Score**: 6/10

**Pros**:
- Less code to write
- Pre-built patterns
- TypeScript support

**Cons**:
- Additional dependency (socket.io-react-hook@2.4.5)
- Less control over connection logic
- May not align perfectly with Supabase auth flow
- Extra abstraction layer
- Maintenance dependency on third-party library

**Complexity**: Low
**Cost**: +1 npm package
**Time**: Quick (1-2 hours)

**Code Snippet**:
```typescript
import { useSocket } from 'socket.io-react-hook';

export const useChat = (sessionId: string) => {
  const { socket, connected } = useSocket(process.env.NEXT_PUBLIC_API_URL!, {
    auth: { token: getSupabaseToken() }, // Need to implement
  });

  // Still need custom logic for session joining, events, etc.
};
```

**Files to Create**:
- `frontend/hooks/useChat.ts` - Wrapper around library
- `frontend/types/chat.ts` - Type definitions

**Files to Modify**:
- `frontend/package.json` - Add socket.io-react-hook

---

### Solution 3: Context API with useContext Hook
**Fit Score**: 7/10

**Pros**:
- Socket instance shared across app
- Single connection for all components
- Good for global chat state
- Follows React Context pattern

**Cons**:
- More boilerplate (Provider, Context, hook)
- Overkill for single-session chat
- Harder to test individual components
- More complex setup

**Complexity**: Medium-High
**Cost**: Minimal
**Time**: Medium (3-4 hours)

**Code Snippet**:
```typescript
// frontend/contexts/SocketContext.tsx
const SocketContext = createContext<SocketContextValue | null>(null);

export const SocketProvider: React.FC = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const initSocket = async () => {
      const token = await getSupabaseToken();
      const newSocket = io(process.env.NEXT_PUBLIC_API_URL!, {
        auth: { token }
      });
      setSocket(newSocket);
    };
    initSocket();
  }, []);

  return (
    <SocketContext.Provider value={{ socket }}>
      {children}
    </SocketContext.Provider>
  );
};
```

**Files to Create**:
- `frontend/contexts/SocketContext.tsx` - Context provider
- `frontend/hooks/useSocket.ts` - useContext wrapper
- `frontend/hooks/useChat.ts` - Chat-specific logic
- `frontend/types/chat.ts` - Type definitions

**Files to Modify**:
- `frontend/app/layout.tsx` - Wrap with SocketProvider

---

### Solution 4: Minimal Implementation (Direct socket.io-client usage)
**Fit Score**: 5/10

**Pros**:
- Simplest approach
- Direct control
- No abstractions

**Cons**:
- Not reusable across components
- No React patterns
- Violates React best practices
- Hard to test
- Manual connection management in every component

**Complexity**: Low
**Cost**: Minimal
**Time**: Quick (1 hour)

**Code Snippet**:
```typescript
// In component directly (NOT RECOMMENDED)
const ChatComponent = ({ sessionId }) => {
  useEffect(() => {
    const socket = io(API_URL);
    socket.emit('chat:join_session', sessionId);

    return () => socket.disconnect();
  }, [sessionId]);
};
```

**Files to Create**:
- None (inline in components)

**Files to Modify**:
- Any component using chat

---

### Solution 5: Type-Safe Event System with Shared Types
**Fit Score**: 8/10

**Pros**:
- Full type safety across frontend/backend
- Prevents event name typos
- Better IDE autocomplete
- Shared contract between client/server
- Enforces event payload structure

**Cons**:
- Requires shared types setup
- More initial configuration
- Need to maintain type definitions

**Complexity**: Medium
**Cost**: Minimal
**Time**: Medium (2-3 hours)

**Code Snippet**:
```typescript
// frontend/types/chat.ts
export interface ServerToClientEvents {
  'chat:session_joined': (data: { sessionId: string }) => void;
  'chat:message_ack': (data: { sessionId: string; status: string; timestamp: string }) => void;
  'chat:assistant_token': (data: { token: string }) => void;
}

export interface ClientToServerEvents {
  'chat:join_session': (sessionId: string) => void;
  'chat:user_message': (data: { sessionId: string; content: string }) => void;
}

// In useChat.ts
import { Socket } from 'socket.io-client';
const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(url, options);

// Now TypeScript validates:
socket.emit('chat:user_message', { sessionId, content }); // ✅ Type-safe
socket.emit('invalid_event', {}); // ❌ TypeScript error
```

**Files to Create**:
- `frontend/types/chat.ts` - Shared event types
- `frontend/hooks/useChat.ts` - Typed hook

**Files to Modify**:
- `backend/src/server.ts` - (Optional) Add same types for backend validation

---

## Recommended Approach

**Hybrid: Solution 1 + Solution 5**

Implement a **custom useChat hook with useRef pattern** (Solution 1) enhanced with **type-safe event definitions** (Solution 5).

**Rationale**:
1. ✅ **Backend already complete** - No backend changes needed
2. ✅ **Official 2025 best practices** - useRef + useEffect pattern recommended by Socket.io docs
3. ✅ **Type safety** - Full TypeScript support with event type definitions
4. ✅ **No extra dependencies** - Uses existing socket.io-client
5. ✅ **Testable** - Hook can be tested in isolation
6. ✅ **Reusable** - Can be used in any component
7. ✅ **Integrates with Supabase** - Leverages existing auth system

---

## Strategic Evaluation

### Goals Alignment
- ✅ **Real-time communication** - Socket.io provides low-latency bidirectional communication
- ✅ **Security** - JWT authentication via Supabase already implemented in backend
- ✅ **Scalability** - Room-based architecture supports multiple concurrent sessions
- ✅ **Developer Experience** - Type-safe hooks improve productivity

### Economic Value
- **Development Time Saved**: Backend already complete (~1 day saved)
- **Maintenance Cost**: Low (no external dependencies beyond socket.io-client)
- **User Experience**: Real-time chat provides immediate feedback
- **Technical Debt**: Minimal (follows React + Socket.io best practices)

### Implementation Feasibility
- **Risk Level**: Low
  - Backend proven working
  - Socket.io is mature, stable technology
  - React hooks pattern is well-established
- **Blockers**: None
  - Backend API ready
  - Frontend dependencies installed
  - Supabase auth working
- **Testing Strategy**:
  - Manual: Connect with valid/invalid tokens, join rooms, send messages
  - Automated: Unit tests for hook logic (Phase 2)

---

## Dependencies

### External Libraries (Already Installed)
- `socket.io-client@4.8.3` - Frontend WebSocket client
- `@supabase/supabase-js@2.90.1` - Auth token retrieval

### Internal Dependencies
- Backend Socket.io server must be running (already implemented)
- Supabase session must be active for authentication
- `NEXT_PUBLIC_API_URL` environment variable set in frontend

---

## References

### Official Documentation
- [Socket.IO - How to use with React](https://socket.io/how-to/use-with-react)
- [Socket.IO - How to use with JWT](https://socket.io/how-to/use-with-jwt)

### Best Practices Articles
- [The Complete Guide to Using socket.io client in 2025](https://www.videosdk.live/developer-hub/socketio/socketio-client) - VideoSDK
- [Using Socket.IO With React Hooks](https://www.codeconcisely.com/posts/react-socket-io-hooks/) - Code Concisely
- [Securing Socket.IO with Authentication in Node.js](https://medium.com/@mcmohangowda/securing-socket-io-with-authentication-in-node-js-33a6ae8bb534) - Medium (March 2025)

### Community Resources
- [socket.io-react-hook (npm)](https://www.npmjs.com/package/socket.io-react-hook) - Third-party hook library
- [GitHub - nitedani/socket.io-react-hook](https://github.com/nitedani/socket.io-react-hook) - Source code

### Security Considerations
- [Understanding JWT authentication with SocketIO](https://wmyers.github.io/technical/nodejs/Understanding-JWT-authentication-with-SocketIO) - Will Myers
- [Socket.IO Authentication System With JWT](https://hayatscodes.hashnode.dev/socketio-authentication-system-with-jwt) - Hayat's Codes

---

## Next Steps

1. **Create Type Definitions** (`frontend/types/chat.ts`)
   - Define `Message` interface
   - Define `ServerToClientEvents` interface
   - Define `ClientToServerEvents` interface

2. **Implement useChat Hook** (`frontend/hooks/useChat.ts`)
   - Socket connection with auth
   - Session room joining
   - Event listeners (session_joined, message_ack)
   - sendMessage method
   - Cleanup on unmount

3. **Testing**
   - Manual verification (connect, auth, join, send)
   - Browser DevTools network inspection
   - Backend logs confirmation

4. **Integration**
   - Use hook in chat UI component
   - Display connection status
   - Handle message sending/receiving
