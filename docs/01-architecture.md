# LeadPilot — Backend Architecture

**Status:** design only. No product code has been written yet — this document and
the empty folder skeleton are the plan we build against.

---

## 1. What this backend is

Base44 builds the screens your users see. This backend is the part that actually
*owns the business*: the database, the AI calls, the integrations, the rules about
who is allowed to do what.

The split matters, and it is the single most important decision here:

| Lives in Base44 (frontend) | Lives here (backend) |
|---|---|
| Screens, forms, buttons, charts | Data storage, business rules |
| Calling your API over HTTPS | AI provider keys, email keys, CRM tokens |
| Showing a user's own data | Deciding *which* data that user may see |

**Why:** anything shipped to a browser can be read by anyone who opens developer
tools. A frontend is a public place. So no API key, no database password, and no
permission decision ever lives in Base44. The frontend asks; the backend decides.

---

## 2. Recommended technology stack

I picked each of these for "a beginner can get unstuck by googling the error
message" as much as for technical merit. Alternatives are listed so you know what
you're saying no to.

| Layer | Choice | Why this one |
|---|---|---|
| Language | **TypeScript on Node.js 22 LTS** | Same language as your frontend, so you don't context-switch. Types catch a whole category of bugs before the code runs. |
| Web framework | **Express 5** | The most-documented Node framework on earth. Every error you hit has a Stack Overflow answer. *Alternative: Fastify — faster and nicer, smaller community.* |
| Database | **PostgreSQL** (hosted on Neon or Supabase) | Your data is deeply relational: an organization has leads, a lead has inquiries, an inquiry has analyses and follow-ups. Postgres also has `JSONB` for the messy AI output, so you get flexibility without giving up structure. *Alternative: MongoDB — easier day one, painful once you need reporting.* |
| DB access | **Prisma** | You describe your tables in one readable file; Prisma generates the migrations and fully-typed query code. Beginners get autocomplete instead of typos. *Alternative: Drizzle — closer to raw SQL.* |
| Validation | **Zod** | One schema defines both "is this request body valid?" and the TypeScript type. Never trust anything Base44 sends you. |
| Auth | **Verify JWTs from a managed identity provider** (Clerk, Supabase Auth, or Auth0) | Do not build password storage, reset emails, and MFA yourself. Buy the identity, own the authorization. |
| Logging | **Pino** | Structured JSON logs. Cheap, and readable by any log platform later. |
| Rate limiting | **express-rate-limit** (memory now, Redis later) | One line to start, one config change to scale. |
| Background jobs | **A `jobs` table + a worker loop** at first; **BullMQ + Redis** later | You do not need Redis on day one. A database-backed queue is easier to debug and you can see the rows. |
| AI | **`@anthropic-ai/sdk`**, hidden behind our own interface | See §6. |
| Tests | **Vitest + Supertest** | Fast, minimal configuration. |
| Deployment | **Railway or Render** (Docker image + managed Postgres) | Push to git, it deploys. No Kubernetes, no AWS console maze. |

### The one non-obvious choice: multi-tenancy from day one

LeadPilot is a SaaS — many separate businesses use the same database. So **every
single table gets an `organization_id` column, and every single query filters on
it.** This is trivial to add now and genuinely miserable to retrofit later. The
worst bug a B2B SaaS can ship is showing Company A the leads of Company B.

---

## 3. Folder structure

```
leadpilot-api/
├── docs/                       # this design, the API contract, the build order
├── scripts/                    # one-off maintenance scripts (seed, backfill)
├── tests/
│   ├── unit/                   # pure logic, no database
│   └── integration/            # real HTTP requests against a test database
└── src/
    ├── server.ts               # starts the HTTP listener. Nothing else.
    ├── app.ts                  # builds the Express app: middleware + routes
    │
    ├── config/                 # reads and VALIDATES environment variables
    │
    ├── middleware/             # code that runs on every request, in order:
    │                           #   requestId → logging → cors → rateLimit
    │                           #   → auth → validate → (route) → errorHandler
    │
    ├── modules/                # ← the business. One folder per concept.
    │   ├── health/             # "is the server alive?" — build this first
    │   ├── auth/               # who is this caller?
    │   ├── organizations/      # tenants, members, plans
    │   ├── leads/              # the core object: an incoming opportunity
    │   ├── inquiries/          # the raw messages a lead sent you
    │   ├── analysis/           # AI-produced summary, intent, urgency, score
    │   ├── replies/            # drafted responses (never auto-sent)
    │   ├── followups/          # scheduled next touches
    │   ├── approvals/          # the human-in-the-loop queue (§7)
    │   ├── audit/              # append-only "who did what" log (§8)
    │   └── webhooks/           # inbound events + outbound notifications
    │
    ├── ai/                     # provider abstraction (§6)
    │   ├── providers/          # anthropic.ts, openai.ts, mock.ts
    │   ├── tasks/              # scoreLead.ts, draftReply.ts, summarize.ts
    │   └── prompts/            # prompt text, versioned, kept out of code
    │
    ├── integrations/           # the outside world
    │   ├── email/
    │   ├── calendar/
    │   └── crm/
    │
    ├── jobs/                   # background work
    │   └── handlers/           # one file per job type
    │
    ├── db/                     # prisma schema, migrations, client singleton
    ├── lib/                    # shared helpers: errors, logger, pagination, ids
    └── types/                  # shared TypeScript types
```

### Inside every module folder, the same four files

This repetition is the point. Once you learn one module, you know them all.

```
modules/leads/
├── leads.routes.ts       # URL paths → controller functions. No logic here.
├── leads.controller.ts   # reads the HTTP request, calls the service,
│                         #   shapes the HTTP response. No business rules.
├── leads.service.ts      # THE BUSINESS RULES. Knows nothing about HTTP.
├── leads.repository.ts   # database queries only. Knows nothing about rules.
└── leads.schema.ts       # Zod schemas for input and output
```

**Why bother with four files instead of one?**

Because each layer can be replaced without touching the others. Swap Postgres for
something else → only `repository` changes. Add a background job that needs the
same logic → it calls `service` directly, no fake HTTP request needed. And you can
unit-test the rules in `service` without starting a web server at all.

---

## 4. The request lifecycle

Every request walks the same path, and each step can stop it early:

```
Base44 browser
  │  HTTPS + Authorization: Bearer <token>
  ▼
[1] requestId      attach a unique id — it appears in every log line
[2] httpLogger     log method, path, status, duration, user, org
[3] cors           is this origin on the allowlist? if not, reject
[4] bodyParser     parse JSON (with a size limit)
[5] rateLimit      too many requests from this key? → 429
[6] authenticate   verify the token signature → load user + organization
[7] authorize      does this role have permission for this action?
[8] validate       does the body match the Zod schema? → 422 if not
[9] controller ──► service ──► repository ──► Postgres
                     │
                     ├──► ai/            (via the provider interface)
                     ├──► jobs/          (queue slow work, return immediately)
                     └──► audit/         (record what just happened)
[10] errorHandler  any thrown error lands here and becomes a clean JSON reply
```

**Error handling** is centralized on purpose. Services throw typed errors
(`NotFoundError`, `ForbiddenError`, `ValidationError`, `RateLimitError`), the last
middleware turns them into the right status code and a consistent JSON body, logs
the full stack trace server-side, and sends the *client* only a safe message and
the request id. Stack traces and database errors never reach the browser — they
leak table names and query structure.

**Logging is two separate things,** and conflating them is a common beginner trap:

- **API logs** (Pino, §4 step 2) — technical, for you, noisy, expire in ~30 days.
- **Audit log** (§8) — business facts, for your users, permanent, in the database.

---

## 5. Data model sketch

Not final, just enough to show the shape. Every table below carries
`organization_id`, `created_at`, `updated_at`.

```
organizations ──┬── users / memberships (role: owner | admin | member)
                ├── api_keys            (hashed, never stored in plain text)
                ├── integrations        (OAuth tokens, encrypted at rest)
                │
                ├── leads ──────────────┬── inquiries        (raw messages in)
                │   status, source,     ├── analyses         (AI output + score)
                │   priority, owner     ├── replies          (drafts, sent state)
                │   value_estimate      └── followups        (due_at, channel)
                │
                ├── action_proposals    (§7 — the approval queue)
                ├── activities          (§8 — the audit log)
                ├── jobs                (background queue)
                ├── ai_requests         (prompt, model, tokens, cost, latency)
                └── webhook_endpoints / webhook_deliveries
```

Two tables that beginners usually forget and later wish they had:

- **`ai_requests`** — log every model call: which model, how many tokens, what it
  cost, how long it took, which lead it was for. Without this you cannot answer
  "why is my AI bill $900 this month?" or "did the new prompt make things worse?"
- **`jobs`** — makes slow work visible and retryable instead of invisible and lost.

---

## 6. AI provider abstraction

**The problem:** if `leads.service.ts` calls the Anthropic SDK directly, then your
business logic is welded to one vendor, and you cannot test it without spending
money and waiting on the network.

**The fix — two layers:**

```
service code
   │  calls a named business task, never a vendor
   ▼
ai/tasks/scoreLead.ts        "given this inquiry, return {score, urgency, intent}"
   │  picks a prompt + a response schema
   ▼
ai/providers/<provider>.ts   implements one small interface:
   │                           complete(messages, opts)
   │                           completeStructured(messages, schema, opts)
   ▼
Anthropic API (default model: claude-opus-5; claude-haiku-4-5 for bulk work)
```

Rules that make this pay off:

1. **Tasks are named after business outcomes**, not prompts — `scoreLead()`,
   `draftReply()`, `summarizeInquiry()`. Business code reads like business.
2. **Always ask for structured output** against a schema, then validate it with
   Zod before use. A model returning unexpected JSON must be a caught error, not
   a crash three functions later.
3. **A `mock` provider is a first-class citizen.** Set `AI_PROVIDER=mock` and the
   whole test suite runs offline, instantly, for free.
4. **Every call is logged to `ai_requests`** and every call has a timeout, a
   retry policy, and a per-organization spend guard.
5. **Prompts live in `ai/prompts/` as versioned files**, not inline strings. When
   quality changes you need to know which prompt version produced which output —
   store that version on the `analyses` row.

---

## 7. Human approval system

This is the feature that makes LeadPilot safe to sell. **The AI never touches the
outside world directly.** It proposes; a human disposes.

```
AI produces something outward-facing
        │
        ▼
action_proposals row  { type, payload, risk, status: 'pending', created_by: 'ai' }
        │
        ├── human clicks Approve  → status: 'approved' → job queued → executed
        ├── human edits, then approves → the edit is stored alongside the original
        └── human clicks Reject   → status: 'rejected', reason recorded
        │
        ▼
every transition writes a row to the audit log (§8)
```

Design details worth getting right the first time:

- **`type` + `payload`, not code.** A proposal is data: `send_email`,
  `book_meeting`, `update_crm_record`, `change_lead_status`. The executor looks up
  a handler by type. Adding a new automation never touches the approval engine.
- **Approval policy per organization.** Each customer decides what needs a human:
  everything, only outbound email, or only actions above a value threshold. Store
  it as configuration, so `auto_approve` is a policy decision, not a code change.
- **Proposals expire.** A follow-up email approved eleven days late is worse than
  one never sent. Give each proposal an `expires_at`.
- **Keep the original.** If a human edits an AI draft before sending, store both.
  That diff is the highest-quality training signal you will ever have about where
  your prompts are wrong.

---

## 8. Activity audit log

An append-only `activities` table. **Never updated, never deleted.**

Each row: `organization_id`, `actor_type` (`user` | `ai` | `system` | `api_key`),
`actor_id`, `action` (`lead.created`, `reply.sent`, `proposal.approved`),
`subject_type`, `subject_id`, `metadata` (JSONB), `request_id`, `ip`, `created_at`.

Why it earns its place:
- Your customers will ask "who changed this lead's status?" — and with AI acting
  in the system, "was that a person or the robot?" is a question you must be able
  to answer with evidence.
- It is the backbone of the activity feed UI in Base44 — same data, read back.
- It is what an enterprise security review asks for first.

Write audit entries **in the same database transaction** as the change itself.
An action that happened without a matching audit row is a broken audit log.

---

## 9. Security baseline

| Concern | Approach |
|---|---|
| Secrets | Only ever in environment variables, validated at boot by Zod. If `DATABASE_URL` is missing, the server refuses to start — loudly, at deploy time, not at 2am under load. |
| Transport | HTTPS only; HSTS; `helmet` for security headers. |
| Tenant isolation | `organization_id` on every table and in every `WHERE` clause. |
| Input | Zod-validate every body, query param, and path param. |
| Rate limits | Per API key and per IP; stricter limits on AI endpoints, which cost real money per call. |
| API keys | Store only a hash. Show the key once at creation. Support rotation and revocation. |
| Third-party tokens | Encrypted at rest with `ENCRYPTION_KEY`. |
| Webhooks in | Verify HMAC signature over the **raw** body before parsing; reject replays by timestamp. |
| Webhooks out | Sign with `WEBHOOK_SIGNING_SECRET` so receivers can trust you. |
| Errors | Safe message + request id to the client; full detail to the logs. |
| Dependencies | `npm audit` in CI; keep the dependency list short. |

---

## 10. Deployment shape

```
Base44 app  ──HTTPS──►  leadpilot-api (Railway/Render, 1+ container)
                              │
                              ├── Postgres (managed, automated backups)
                              ├── Redis (optional, added when you need it)
                              └── worker process (same image, different start command)
```

Run the API and the background worker from **one codebase, two processes**. Same
Docker image, different entry point. You get shared types and shared business
logic with no duplication, and you can scale them independently later.

Three environments: `development` (your laptop), `staging` (a real deploy with
fake data), `production`. Same code, different environment variables. That is the
entire difference, and keeping it that way is what makes deploys boring.
