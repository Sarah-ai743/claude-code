# LeadPilot AI

Your 24/7 multilingual AI lead-conversion team. LeadPilot AI receives leads,
detects their language, qualifies them against your approved business
knowledge, drafts or sends replies, follows up automatically, and escalates
anything uncertain to a human — for any lead-driven service business
(cleaners, plumbers, electricians, roofers, HVAC, auto detailing, beauty
salons, photographers, consultants, marketing agencies, moving companies,
professional/appointment/quote-based businesses).

Stack: **Next.js 14 (App Router) · TypeScript · Tailwind CSS · Supabase
(Postgres + Auth + RLS) · Anthropic Claude API**.

See `ARCHITECTURE.md` for the system design and `TODO.md` for live build
status (what's done, in progress, remaining, blocked).

## Local development

```bash
npm install
cp .env.example .env.local   # fill in real values, see below
npm run dev
```

Other useful commands:

```bash
npm run typecheck   # tsc --noEmit
npm test             # vitest — 93 tests, no network/DB required
npm run build        # production build (next build)
```

---

## 1. Required environment variables

| Variable | Where it's used | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | Safe to expose — RLS enforces access |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | **Secret.** Bypasses RLS. Used only by `/api/leads/public` and `/api/cron/followups` |
| `ANTHROPIC_API_KEY` | server only | **Secret.** From the Anthropic Console |
| `ANTHROPIC_MODEL` | server only | e.g. `claude-opus-4-5` |
| `CRON_SECRET` | server only | **Secret.** Authorizes calls to the follow-up cron endpoint |
| `NEXT_PUBLIC_APP_URL` | client + server | Public base URL (auth email redirects, public form link) |

Full template with generation instructions: `.env.example`.

---

## 2. Database setup instructions

1. Create a Supabase project at [supabase.com](https://supabase.com).
2. Copy the Project URL, `anon` key, and `service_role` key into your env vars.
3. Run the migration against your project:
   ```bash
   # Option A: Supabase CLI
   supabase link --project-ref <your-project-ref>
   supabase db push

   # Option B: psql directly
   psql "$DATABASE_URL" -f supabase/migrations/0001_init.sql

   # Option C: paste supabase/migrations/0001_init.sql into the
   # Supabase Dashboard's SQL Editor and run it.
   ```
4. Verify Row Level Security: the migration enables RLS and adds
   tenant-scoping policies on every business table. **This has not been
   run against a live Postgres instance in this build sandbox** — after
   applying it, create two test accounts/organizations and confirm one
   cannot read the other's leads/messages/settings before going further.
5. (Optional but recommended) Regenerate accurate TypeScript types once
   your schema is live:
   ```bash
   supabase gen types typescript --project-id <ref> > lib/supabase/database.types.ts
   ```
   The hand-written version in this repo mirrors the migration exactly,
   but the generated one is the source of truth going forward.

---

## 3. Anthropic setup instructions

1. Create an API key at [console.anthropic.com](https://console.anthropic.com).
2. Set `ANTHROPIC_API_KEY` in your environment.
3. Set `ANTHROPIC_MODEL` to the model you want to use (default in
   `.env.example`: `claude-opus-4-5`; use whatever current model id your
   account has access to).
4. No other Anthropic-side configuration is required — this app calls the
   Messages API directly and validates every response against a strict
   Zod schema before trusting it (`lib/ai/schema.ts`,
   `lib/ai/analyzeLead.ts`). Malformed or unsafe output always falls back
   to a safe "route to a human" response; it never crashes the request
   and never invents facts.

---

## 4. Deployment instructions (Vercel)

1. Push this repository to GitHub/GitLab/Bitbucket.
2. Import it into [Vercel](https://vercel.com/new).
3. Add all the environment variables from section 1 in the Vercel
   project's Settings → Environment Variables (Production + Preview).
4. Deploy. `vercel.json` in this repo configures the follow-up cron job
   (`/api/cron/followups`, every 15 minutes) — Vercel reads this
   automatically and, when `CRON_SECRET` is set, sends it as
   `Authorization: Bearer <CRON_SECRET>` on every invocation, which the
   route requires.
   - Vercel's free/Hobby tier limits cron frequency; if you're on that
     tier, either accept a coarser interval or run the follow-up
     processor from an external scheduler (e.g. cron-job.org, or a
     Supabase Edge Function on a schedule) hitting the same endpoint
     with the same `Authorization` header.
5. Confirm the build succeeds in Vercel's dashboard (it does locally —
   see section 6).

**This build has not actually been deployed anywhere from this session** —
there is no hosting account connected to this sandbox. The steps above are
accurate and ready to run; "deployed" is not being claimed.

---

## 5. Domain setup instructions

1. In Vercel: Project → Settings → Domains → add your domain (e.g.
   `app.leadpilot.ai`) and follow the DNS instructions Vercel shows
   (usually a `CNAME` to `cname.vercel-dns.com`, or an `A` record for an
   apex domain).
2. Update `NEXT_PUBLIC_APP_URL` to the final `https://` domain and
   redeploy — this value is used in Supabase Auth email redirect links
   and the public lead-form link shown on the Integrations page.
3. In Supabase: Authentication → URL Configuration, add the same domain
   (and `/auth/callback`) to the allowed Redirect URLs, or auth email
   links will be rejected.

---

## 6. Production checklist

- [x] `npm run typecheck` passes
- [x] `npm test` passes (93 tests)
- [x] `npm run build` succeeds
- [ ] Migration applied to a real Supabase project (not run in this sandbox)
- [ ] RLS tenant-isolation manually verified with two real accounts
- [ ] Real `ANTHROPIC_API_KEY` set and a real lead run end-to-end
- [ ] Vercel Cron (or external scheduler) confirmed to be hitting
      `/api/cron/followups` on schedule
- [ ] Domain + Supabase Auth redirect URLs configured
- [ ] `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`
      generated fresh for production (never reuse local dev values)
- [ ] Decide on and configure real outbound email/SMS delivery if you
      want replies sent outside the in-app inbox (see limitations below)

---

## 7. Known limitations

- **No live database was available in this build environment.** The
  schema, RLS policies, and application code are written and unit/
  integration-tested against a faithful in-memory fake of the Supabase
  query builder (`tests/helpers/fakeSupabase.ts`), but the real Postgres
  RLS policies themselves have not been exercised against a live
  project. Do this (section 2, step 4) before handling real customer data.
- **In-memory rate limiting.** `lib/rateLimit.ts` is per-process, so on a
  platform running multiple serverless instances the effective limit is
  higher than configured, and it resets on cold start. Fine for an MVP;
  move to Upstash Redis (`@upstash/ratelimit`) for real production scale.
- **No outbound email/SMS provider wired up.** AI and human replies are
  generated, stored, and shown in the in-app Inbox, but nothing sends
  them to the customer's own email/phone yet. The Integrations page
  documents this rather than faking a connection — wiring a provider
  (Postmark, Twilio) is a follow-up task.
- **Billing/Stripe is not implemented**, per the build instructions
  ("do not implement payment processing until the core app is stable").
  Plans are shown on the Pricing page and a `plan` field exists on
  `organizations`, ready for Stripe to be layered in.
- **The 30 AI conversation scenarios in `tests/ai-scenarios.test.ts` are
  schema/guardrail conformance tests, not live Claude API calls** — this
  sandbox has no network access to Anthropic. They prove the output
  contract and safety net are sound; an end-to-end run against the real
  API with real traffic should happen before launch.
- **Account deletion is request-only, not automatic.** The Settings page
  logs a deletion request rather than immediately cascading a destructive
  delete across a tenant's data, since that needs its own confirmation
  flow this MVP doesn't yet have.
- **Data export, opt-out, and audit logging are functional but basic** —
  JSON export and an `activity_log` table exist and work; there is no
  configurable retention policy yet.

## 8. What still needs to be done manually

1. Provision the Supabase project and run the migration (section 2).
2. Get a real Anthropic API key and confirm billing/rate limits suit
   expected volume (section 3).
3. Deploy to Vercel and set all environment variables (section 4).
4. Point a real domain at it and update Supabase Auth redirect URLs
   (section 5).
5. Manually verify tenant isolation with two real test accounts before
   onboarding a real customer.
6. Send a real test lead through `/contact/<slug>` end-to-end and confirm
   it appears in the Inbox/Dashboard with a real Claude-generated reply.
7. Decide on and integrate an outbound email/SMS provider if in-app-only
   replies aren't sufficient for your launch.
8. Review `TODO.md` for the complete, current list of done / in progress
   / remaining / blocked items.
