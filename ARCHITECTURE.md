# LeadPilot AI — Architecture

## Status note (2026-09-24)

The repository previously contained an Express-only backend (`leadpilot-api`)
designed to sit behind a separate **Base44** no-code frontend, with no
database (in-memory repositories) and auth deferred to "Phase 1+". Today's
spec requires a self-contained Next.js + Supabase SaaS product with a full
UI (landing page, dashboard, inbox, pipeline, settings, onboarding) and
real multi-tenant Postgres storage with RLS. That is architecturally
incompatible with the old skeleton, so this is a rebuild on the mandated
stack. Reusable logic (AI prompts, Zod schemas, guardrails, follow-up
policy, business-time helpers) is ported in; the old Express app,
controllers, and in-memory repositories are replaced.

## Stack

- **Framework**: Next.js 14 (App Router), TypeScript, React Server Components
  + Client Components where interactive.
- **Styling**: Tailwind CSS.
- **Database / Auth**: Supabase (Postgres + Supabase Auth + Row Level Security).
- **AI**: Anthropic Claude API (`@anthropic-ai/sdk`), structured output
  validated with Zod. No other model provider.
- **Deployment target**: Vercel (Next.js) + Supabase (managed Postgres).
  Follow-ups run via a DB-backed job table processed by a scheduled route
  (Vercel Cron hitting `/api/cron/followups`), so jobs survive restarts and
  don't depend on a long-lived process.
- **Testing**: Vitest for unit + integration tests against a real (or
  local) Supabase Postgres instance where feasible; pure-function tests
  (schema validation, guardrails, business time, follow-up policy) run
  without any network.

## Multi-tenancy model

- One row per business in `organizations`. Every tenant-scoped table has an
  `org_id` foreign key.
- `profiles` maps `auth.users.id` -> `org_id` (+ role: owner/agent).
- RLS policy pattern on every tenant table:
  `org_id = (select org_id from profiles where id = auth.uid())`
- The public lead-capture endpoint (`/api/leads/public`) is the one path
  that must write without a logged-in session. It runs server-side only,
  using the Supabase **service role** key (never exposed to the browser),
  after validating the business slug exists and the payload passes Zod
  validation + rate limiting. This is safer than opening an RLS INSERT
  policy to `anon` for the leads table, because the service-role path is
  the only INSERT surface and is fully controlled by our own code.
- Every other database access from the browser uses the anon key + the
  user's session JWT, so RLS is the actual enforcement boundary for reads
  and authenticated writes.

## Core data model (see `supabase/migrations/`)

`organizations`, `profiles`, `services`, `service_areas`, `faqs`,
`qualification_questions`, `pricing_rules`, `followup_settings`, `leads`,
`conversations`, `messages`, `followup_jobs`, `activity_log`,
`approvals` (DRAFT-mode pending AI replies awaiting human approval).

## AI qualification pipeline

1. Public form POST -> `leads` row + `conversations` row + first `messages`
   row (customer message) created via service-role insert.
2. `analyzeLead()` builds a prompt from: customer message, conversation
   history, organization profile, services, FAQs, pricing rules,
   qualification questions, custom AI instructions.
3. Claude is called with a strict JSON output contract; the raw response is
   parsed and validated against a Zod schema
   (`language, intent, requested_service, urgency, qualification_status,
   missing_information, sentiment, recommended_action, reply,
   human_review_required, human_review_reason`). Malformed or
   schema-failing output is never trusted: it falls back to
   `human_review_required = true` with `recommended_action = "human_handoff"`
   and no auto-reply is sent.
4. Depending on the org's automation mode (`draft` / `safe_autopilot` /
   `autopilot`) and `human_review_required`, the reply is either queued as
   an `approvals` row (DRAFT, or SAFE_AUTOPILOT when uncertain) or written
   directly as an AI message (SAFE_AUTOPILOT routine / AUTOPILOT).
5. Lead `qualification_status` / pipeline `stage` are updated from the
   structured output; stage can also be moved manually by the business.

## Follow-up engine

- `followup_jobs` rows are created when a lead needs a scheduled nudge,
  storing `run_at`, `attempt_number`, `status`.
- `/api/cron/followups` (invoked by Vercel Cron) selects due, still-valid
  jobs, checks: not opted out, lead stage not Won/Lost/Human Review, within
  the org's allowed communication hours (converted via org timezone),
  attempt count under the org max — then generates and sends/queues the
  follow-up and schedules the next one if any remain.
- Because jobs live in Postgres, a redeploy or crash never loses one; the
  next cron invocation just picks up whatever is due.
- A customer reply cancels any pending `followup_jobs` for that lead
  (status -> `cancelled`).

## Security

- All Supabase tables tenant-scoped by RLS; verified by an isolation test
  (two orgs, assert cross-org reads return zero rows).
- Service role key is server-only (never in a `NEXT_PUBLIC_*` var).
- Public endpoints (`/api/leads/public`, `/api/webhooks/*`) are rate
  limited and validate all input with Zod before touching the DB.
- No secrets logged; `pino` redaction retained from the prior backend.

## Known architectural limitations (see TODO.md for live status)

- Vercel Cron's free tier grants limited invocation frequency; the
  deployment doc explains the tradeoff and how to use an external
  scheduler (cron-job.org, Supabase Edge Functions cron) for tighter
  intervals if needed.
- Outbound email/SMS sending is not wired to a real provider in this MVP;
  the reply is generated, stored, and shown in-app, with the delivery
  hook documented as a follow-up integration (Postmark/Twilio) rather than
  faked.
