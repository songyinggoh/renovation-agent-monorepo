# Project roadmap and phases

## Phase 0 – Skeleton

### Goal

Get the **bare skeleton** of the app up: deployable FE + BE + DB + Auth, with the minimum schema so future phases don’t become refactors.

### Architecture decisions

- **Frontend:** Next.js (App Router) on Vercel.
- **Backend:** Cloud Run service with Express/Fastify + TypeScript.
- **DB & Auth:** Supabase (Postgres, RLS, Google login).
- **ORM:** Drizzle ORM with generated types.

### Tasks

**~~0.1 Repos & environments~~**

- ~~Create mono-repo or two repos:~~
    - `~~/apps/web` → Next.js frontend~~
    - `~~/apps/api` → Cloud Run backend~~
- ~~Set up shared `env/` spec and `.env` loading (t3 style or custom).~~

**~~0.2 Supabase project~~**

- ~~Create Supabase project.~~
- ~~Enable **Google provider** (Sign in with Google).~~
- ~~Create base tables:~~
    
    ```sql
    create table public.profiles (
      id uuid primary key references auth.users(id) on delete cascade,
      full_name text,
      avatar_url text,
      stripe_customer_id text,
      created_at timestamptz default now()
    );
    
    create table public.renovation_sessions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references auth.users(id) on delete cascade,
      title text,
      phase text default 'INTAKE',
      total_budget numeric,
      currency text,
      is_paid boolean default false,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    
    create table public.chat_messages (
      id uuid primary key default gen_random_uuid(),
      session_id uuid references public.renovation_sessions(id) on delete cascade,
      user_id uuid references auth.users(id),
      role text, -- 'user' | 'assistant' | 'system'
      content text,
      metadata jsonb,
      created_at timestamptz default now()
    );
    
    ```
    
- ~~Add **RLS** policies:~~
    - `~~profiles` only `auth.uid() = id`~~
    - `~~renovation_sessions` / `chat_messages` only `auth.uid() = user_id`.~~

**~~0.3 Drizzle setup (backend)~~**

- ~~Configure Drizzle with Supabase Postgres URL.~~
- ~~Create schema files matching above.~~
- ~~Generate types and run migrations via Drizzle.~~

**0.4 Cloud Run backend skeleton**

- Express server with:
    - `/healthz`
    - `/api/sessions`:
        - `GET /` – list user sessions (dummy data initially)
        - `POST /` – create a session
    - Middleware: `authMiddleware` that verifies Supabase JWT via service role key and attaches `req.user`.
- Dockerfile + Cloud Build or GitHub Actions to deploy.

**0.5 Next.js frontend skeleton**

- Configure Supabase client (`@supabase/ssr` or auth-helpers).
- Pages:
    - `/` – Landing with “Sign in with Google” button.
    - `/app` – Basic dashboard that:
        - requires auth
        - lists renovation sessions via backend `/api/sessions`.

### Definition of Done – Phase 0

- User can:
    - Log in with Google.
    - Hit `/app` and see “You are logged in as X”.
    - Create a dummy “renovation session” from the frontend and see it stored in Supabase via backend.
- Cloud Run and Vercel both deployed with CI/CD.
- Drizzle migrations are the **source of truth** for DB schema.

---

## Phase 1 – Chat MVP (no Stripe yet)

### Goal

Make the renovation agent **actually talk**, with text-only chat, per-session memory stored in Supabase.

### Architecture decisions

- **Realtime channel:** Socket.io (front ↔ backend).
- **LLM:** Gemini 2.5 (chat only).
- **Agent framework:** LangChain v1 `createAgent` with tools stubbed/minimal.
- **Memory:** Chat messages + simple short-term memory via Supabase checkpointer or custom.

### Tasks

**1.1 Socket.io infrastructure**

- Backend:
    - Add Socket.io server to Cloud Run app.
    - Auth handshake: frontend sends Supabase JWT → backend verifies → attaches `userId`.
    - Namespaces/rooms:
        - e.g. join room `session:<sessionId>` per renovation session.
    - Events:
        - `chat:join_session`
        - `chat:user_message`
        - `chat:assistant_token` (streamed)
- Frontend:
    - `useChat(sessionId)` hook:
        - connect, join session,
        - send message,
        - maintain message list from both REST history and new socket events.

**1.2 LangChain v1 + Gemini integration**

- Backend `ChatService`:
    - Wraps `renovationAgent.stream(...)`.
    - For now, agent is minimal:
        - A system prompt about being renovation planner.
        - Tools: maybe none or just 1 no-op tool for structure.
- On `chat:user_message`:
    - Save `chat_messages` row.
    - Call agent with:
        - `messages`: history from DB (or `checkpointer`).
        - `configurable.thread_id = sessionId`.
    - Stream tokens back via `chat:assistant_token`.
    - At end, persist assistant message into `chat_messages`.

**1.3 Memory for MVP**

Simplest version:

- Before each agent call:
    - Load last N chat_messages for that session.
- After each agent call:
    - Store new assistant message.

Optional: early integration of **LangGraph MemorySaver/PostgresSaver** as checkpointer.

**1.4 UX**

- Simple chat UI:
    - messages scroll,
    - input box,
    - “Thinking…” indicator when agent is responding.

### Definition of Done – Phase 1

- Authenticated user can:
    - create a new project/session,
    - open session chat,
    - send text messages and get streaming replies.
- Messages are persisted per session in Supabase.
- Basic renovation-aware behavior (even if generic).

---

## Phase 2 – Images + Style & Products

### Goal

Move from “plain text chatbot” to **home renovation intake & planning assistant**:

- Accept photos & floor plans.
- Show style moodboards (Pinterest → GCS).
- Have product metadata from Taobao in DB.
- Expose tools for style & products to the agent.

### Architecture decisions

- **Storage:**
    - User uploads → Supabase Storage.
    - Pinterest moodboards → GCS.
- **Product data:** Taobao scraper microservice writing into `taobao_products`.
- **Tools:** `get_style_examples`, `search_products`, `save_intake_state`, `save_checklist_state`.

### Tasks

**2.1 File upload pipeline (frontend ↔ Supabase)**

- Frontend:
    - Room intake form in chat or wizard: “Upload room photos / floor plan”.
    - Multi-file upload with progress.
- Use **Supabase Storage**:
    - Buckets: `user-uploads/`, folder by user_id/session_id.
- Backend:
    - Option A: frontend directly uploads via Supabase signed URLs, sends file metadata to backend.
    - Option B: backend generates pre-signed URLs; frontend PUTs.

Add `room_assets` table + Drizzle schema:

```sql
create table public.room_assets (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms(id) on delete cascade,
  asset_type text, -- 'photo' | 'floorplan' | 'render'
  storage_path text,
  source text,     -- 'user_upload' | 'pinterest' | 'nano_banana'
  metadata jsonb,
  created_at timestamptz default now()
);

```

**2.2 Rooms & styles data model**

- Add `rooms` table + Drizzle mapping.
- In intake flow:
    - Ask “Which rooms are we working on?”
    - Create `rooms` rows and `room_assets` for uploaded photos.
- Add style preferences & budget fields to `renovation_sessions`.

**2.3 Pinterest → GCS style scraper**

- Small Node/TS worker or script:
    - For each style (wabi-sabi, japandi, brutalist, scandinavian):
        - Download curated image set (manually curated board URLs).
        - Upload to GCS bucket: `styles/<style>/xxx.jpg`.
    - Store metadata in DB (optional) or just infer from GCS path.

**2.4 Taobao scraper microservice**

- Node/TS microservice:
    - Input: style, category, query keywords.
    - Output: DB rows in `taobao_products`.
- Strategy:
    - For MVP: manual curated CSV + import.
    - Later: automated cron-based scraping.

`taobao_products` table is already defined earlier; add Drizzle model and `ProductService`.

**2.5 LangChain tools**

Implement and register:

- `get_style_examples(style)` → returns moodboard URLs from GCS.
- `search_products(style, category, maxPrice, roomId)` → returns candidate Taobao products.
- `save_intake_state(...)`:
    - persists style preferences, budget, rooms.
- `save_checklist_state(...)`:
    - persists chosen categories per room.

**2.6 Agent behavior update**

- Extend prompts:
    - In **INTAKE** phase, ask for photos, floor plan, style, budget.
    - In **CHECKLIST** phase, propose items per room.
- Agent uses tools to:
    - Show moodboards,
    - Propose product categories (no exact Taobao SKUs yet, or simple ones).

### Definition of Done – Phase 2

- User can:
    - Start a project, upload photos & layout.
    - Pick a style and budget.
    - See style moodboard examples.
    - Receive per-room item suggestions influenced by style & budget.
- Taobao products exist in DB and can be fetched via an API/tool call.
- Agent uses at least `get_style_examples` & `search_products` tools correctly.

---

## Phase 3 – Nano Banana + PDF

### Goal

Turn the planner into a **visual designer & actionable report generator**:

- Nano Banana (Gemini image) renders per room.
- PDF report with visuals + shopping list.

### Architecture decisions

- **Image generation:** Gemini / Nano Banana.
- **Render storage:** GCS (cheaper & better for image-heavy).
- **PDF generation:** Node (Playwright or `pdfkit`) running in backend container, output → Supabase Storage.

### Tasks

**3.1 Render service**

- Service interface:
    
    ```tsx
    interface RenderRequest {
      roomId: string;
      mode: "edit_existing" | "from_scratch";
      baseImageUrl?: string;
      prompt: string;
    }
    
    interface RenderResult {
      renderUrl: string;
      width: number;
      height: number;
    }
    
    ```
    
- Implementation:
    - Call Gemini image endpoint / Nano Banana.
    - Save result to GCS bucket: `renders/<sessionId>/<roomId>/<timestamp>.webp`.
    - Return signed URL for UI.

**3.2 `generate_render` & `save_renders_state` tools**

- `generate_render` tool:
    - Input: sessionId, roomId, mode, baseImageUrl?, prompt.
    - Calls RenderService and returns URL.
- `save_renders_state` tool:
    - Save mapping of room to render URL (and type = initial / iteration) in `room_assets` or `pdf_reports` metadata.

**3.3 PDF generator**

- HTML template:
    - Cover page: project title, style, budget.
    - Per room:
        - Render image(s).
        - Short design summary.
        - Product table (name, price, link).
    - Totals section.
- Implementation:
    - `ReportService.createPdf(sessionId)`:
        - Loads session, rooms, renders, product recommendations.
        - Renders HTML (e.g. with React + `@react-pdf/renderer` or Playwright to print PDF).
        - Saves PDF into Supabase Storage: `reports/<sessionId>.pdf`.
        - Writes a row in `pdf_reports`.
- `create_pdf_report` tool:
    - Triggered by backend (after payment) or by agent when allowed.
    - Returns URL for download.

**3.4 Frontend integration**

- UI:
    - “Preview report” screen (shows images & items).
    - “Generate final PDF” button (gated later by Stripe).
- After generation:
    - Show “Download PDF” button.
    - Optionally email link to user (Supabase functions / backend mailer).

### Definition of Done – Phase 3

- For any session with intake + plan complete:
    - Agent can generate renders for each room (even if slow).
    - User can see final renders in UI.
- Backend can generate a proper PDF with:
    - At least 1 render per room.
    - Items & links.
    - Budget totals.
- PDF stored and downloadable.

---

## Phase 4 – Stripe & Plans

### Goal

Monetise: **Stripe-powered plans & gating** on expensive operations (renders + PDFs).

### Architecture decisions

- **Products:**
    - One-off “single report” product.
    - Or subscription with X reports/month.
- **Sync:** Use Stripe webhook handler (optionally Stripe Sync Engine).
- **Entitlements:** `subscriptions` table with `remaining_credits`.

### Tasks

**4.1 Stripe setup**

- Stripe dashboard:
    - Products: `RENOVATION_SINGLE`, `RENOVATION_PRO_MONTHLY`.
    - Prices per product.
- Webhook endpoint on Cloud Run:
    - `/api/stripe/webhook`.
    - Verify signatures.
    - Handle events:
        - `checkout.session.completed`
        - `customer.subscription.updated`
        - `invoice.payment_failed`

**4.2 Billing tables**

- Add `subscriptions` & `payments` tables (if not already):
    
    ```sql
    create table public.subscriptions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references auth.users(id) on delete cascade,
      plan_code text not null,
      stripe_subscription_id text,
      status text,
      current_period_end timestamptz,
      remaining_credits int default 0,
      created_at timestamptz default now()
    );
    
    ```
    
- Webhook handler should:
    - Upsert subscription row by `stripe_subscription_id` & user.
    - Set `status`, `current_period_end`, `remaining_credits`.

**4.3 Checkout API**

- `POST /api/billing/checkout`:
    - Body: `{ planCode, sessionId? }`.
    - Auth user.
    - Ensure `profiles.stripe_customer_id` exists or create Stripe customer.
    - `stripe.checkout.sessions.create` with:
        - `customer`
        - `line_items` from `planCode` → `priceId`
        - `mode`: `"subscription"` or `"payment"`
        - `success_url` & `cancel_url`.
    - Return `url`.

**4.4 Gating expensive actions**

- `ReportService.createPdf`:
    - Before generating:
        - Check if:
            - `subscriptions.status === 'active'` AND `remaining_credits > 0`, then `remaining_credits--`.
            - OR `one-time payment` row exists for that report/session.
- `generate_render`:
    - Optionally:
        - Limit high-res renders or multiple iterations to paying users.

**4.5 Frontend UX**

- Pricing page:
    - Show plan features / price.
    - “Upgrade” → call `/api/billing/checkout`.
- Report screen:
    - If user has no credits:
        - Show paywall with CTA → `/api/billing/checkout`.
- Account page:
    - Show current plan, next billing date, remaining credits.

### Definition of Done – Phase 4

- Users can:
    - Start free, reach a preview state (low-res / partial).
    - Click Upgrade and pay through Stripe.
    - After payment, **can generate full PDF & final renders**.
- Subscriptions & payments are recorded in Supabase.
- Entitlements are enforced server-side (no bypass via frontend).

---

If you want, I can now:

- Turn this into a **Notion-ready project plan** (with epics & tasks bullets), or
- Pick **one phase** (e.g. Phase 1 or Phase 3) and write **actual code scaffolding** for the backend & frontend pieces you’ll need.