# What to build first

The ordering principle: **each phase ends with something that visibly works.**
Not "the auth layer is 80% done" — something you can open, click, or curl.

A second principle worth stating out loud: build the boring parts first. Config,
errors, logging, and auth are what make everything after them fast to build. Teams
that start with the exciting AI feature end up rebuilding it once the foundations
land underneath it.

---

## Phase 0 — A deployed "hello" (start here)

**Goal:** an empty but *real* API, live on the internet, deploying from git.

- `package.json`, TypeScript, ESLint, Prettier
- `src/config/` — load env vars and validate with Zod; refuse to boot if any are missing
- `src/lib/logger.ts` (Pino) and `src/lib/errors.ts` (the typed error classes)
- `src/middleware/` — requestId, httpLogger, cors, errorHandler
- `src/modules/health/` — `GET /v1/health`
- `Dockerfile`, deploy to Railway or Render

**Done when:** `curl https://<your-url>/v1/health` returns `{"data":{"status":"ok"}}`
and a deliberate error returns your clean JSON envelope, not an HTML stack trace.

> Do not skip the deploy. Deploying an empty app takes an hour. Deploying an app
> with a database, a queue, and AI calls takes a week, because every problem
> arrives at once and you can't tell them apart.

---

## Phase 1 — Identity and tenancy

**Goal:** the backend knows who is calling and which organization they belong to.

- Postgres provisioned; Prisma set up; first migration
- Tables: `organizations`, `users`, `memberships`
- `middleware/authenticate.ts` — verify the JWT against the provider's JWKS
- `middleware/authorize.ts` — role check (`owner` / `admin` / `member`)
- `GET /v1/me`
- `modules/audit/` — the `activities` table and a `recordActivity()` helper

**Done when:** a real token from your identity provider returns the right user,
a bad token returns `401`, and logging in writes an audit row.

---

## Phase 2 — Leads CRUD ← the first thing Base44 can actually use

**Goal:** the core object exists end to end, and a Base44 screen renders it.

- Tables: `leads`, `inquiries`
- Full module: routes, controller, service, repository, schema
- List with filtering, sorting, and cursor pagination
- Rate limiting middleware turned on
- Audit entries on create / update / delete
- Integration tests against a test database

**Done when:** a Base44 screen lists leads, opens one, and edits its status —
using nothing but this API. **This is your first real milestone.** Stop and
connect the frontend here; do not build three more phases blind.

---

## Phase 3 — The AI layer

**Goal:** one AI feature working, with the abstraction and the guardrails in place.

- `ai/providers/anthropic.ts` and `ai/providers/mock.ts` behind one interface
- `ai/tasks/analyzeInquiry.ts` — returns `{ summary, intent, urgency, score }`
- `ai/prompts/` with a version tag stored on every result
- `jobs` table + worker loop + `GET /v1/jobs/:id`
- `POST /v1/leads/:id/analyze` → `202` + jobId
- `ai_requests` logging: model, tokens, cost, latency
- Per-organization spend guard and timeouts

**Done when:** the test suite passes with `AI_PROVIDER=mock` and no network, and
a real analysis appears in the Base44 UI after polling.

---

## Phase 4 — Prioritization and approvals

**Goal:** the product's actual promise — AI proposes, human decides.

- Scoring on top of analysis; a prioritized queue endpoint
- `action_proposals` table and the approvals module
- Approve / reject / edit-then-approve, all audited
- Per-organization approval policy (what needs a human, what doesn't)
- `followups` module: schedule, list what's due, complete

**Done when:** an AI-drafted reply sits in a queue, a human edits and approves it,
and the audit log shows every step with the actor recorded.

---

## Phase 5 — Reaching the outside world

**Goal:** approved actions actually happen.

- `integrations/email/` behind a provider interface (Resend or Postmark first)
- The job handler that executes an approved proposal, with retries and backoff
- Delivery status tracked back onto the `replies` row
- Outbound webhooks so Base44 (or Zapier) can react to events

**Done when:** approving a draft sends a real email and the audit log proves who
approved it, when, and what was actually sent.

---

## Phase 6 — Integrations and automation

Calendar (Google OAuth, booking follow-ups), CRM sync (HubSpot first), inbound
webhooks from web forms, and scheduled automation — "every morning, analyze new
leads and queue proposals for anything above the threshold."

By now the patterns are all established, so this phase is mostly repetition of
things you already know how to do. That is the payoff for the earlier order.

---

## Suggested first week

| Day | Work |
|---|---|
| 1 | Phase 0 up to a local `/v1/health` |
| 2 | Dockerfile, deploy, live URL, CI running tests |
| 3 | Postgres + Prisma + first migration + `organizations`/`users` |
| 4 | JWT verification middleware + `GET /v1/me` |
| 5 | Start the leads module: schema, repository, create + list |

---

## Things to deliberately **not** build yet

Resist these until something real demands them. Each one adds moving parts you'd
have to debug while still learning the basics:

- Redis, BullMQ, or any dedicated queue (the `jobs` table is enough)
- Microservices (one deployable service is correct at this size — and for a long time)
- A GraphQL layer alongside REST
- Your own password storage, sessions, or MFA
- Streaming AI responses to the browser
- Kubernetes, Terraform, or a multi-region setup
- Fine-tuning or vector search (good prompts plus a `WHERE` clause go a long way)
