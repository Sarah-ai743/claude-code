# LeadPilot AI — TODO

Legend: [x] done & verified · [~] in progress · [ ] not started · [!] blocked

## 1. Inspect environment — [x]
Reviewed existing repo (an Express-only backend built for a different
"Base44" no-code frontend, no DB, no UI). Rebuilt on the mandated
Next.js + Supabase stack; reusable logic (business-time math, guardrails,
follow-up policy shape) ported and adapted; everything else replaced.

## 2. Architecture — [x]
`ARCHITECTURE.md` written and kept current.

## 3. Initialize project — [x]
Next.js 14 App Router + TypeScript + Tailwind. `npm run build` succeeds.

## 4. Database schema — [x]
`supabase/migrations/0001_init.sql`: organizations, profiles, services,
service_areas, faqs, qualification_questions, pricing_rules,
followup_settings, leads, conversations, messages, followup_jobs,
activity_log, approvals. RLS enabled + tenant policies on every table.
`organizations` deliberately has no anon SELECT policy (see migration
comment) — the public contact page fetches only safe columns server-side.
[!] Not run against a live Postgres instance in this sandbox (none
provisioned). Must be applied and RLS manually verified before real use —
see README section 2/6.

## 5. Authentication — [x]
Signup, login, logout, password reset request + confirm, PKCE
`/auth/callback` exchange route, protected-route middleware.

## 6. Multi-tenancy / RLS — [x]
`profiles.org_id` links a user to one org. Every tenant table scoped by
`org_id` + RLS policy. Server actions additionally scope queries by the
session's own `org_id` (defense in depth beyond RLS). Verified at the
application layer by `tests/integration/leadPipeline.test.ts`
("tenant isolation" suite); real Postgres RLS itself untested here (see
item 4).

## 7. Onboarding — [x]
4-step wizard (`app/onboarding/page.tsx`) collecting every field the spec
lists, writing organization + services + areas + FAQs + pricing rules +
qualification questions + follow-up defaults in one server action.

## 8. Business knowledge — [x]
`/knowledge` — full CRUD on profile, services, service areas, pricing
rules, FAQs, qualification questions, brand tone, AI instructions.

## 9. Lead capture — [x]
`/contact/[slug]` public form (name/email/phone-optional/message) +
`POST /api/leads/public`: Zod-validated, per-IP rate limited, CORS-open
for embedding on a business's own site, idempotency-key deduped.

## 10. Claude integration — [x]
`lib/ai/prompt.ts` + `lib/ai/schema.ts` + `lib/ai/analyzeLead.ts`. Exact
spec output contract (language, intent, requested_service, urgency,
qualification_status, missing_information, sentiment, recommended_action,
reply, human_review_required, human_review_reason). Grounding rules and
escalation rules are in the system prompt; malformed/unsafe output is
never trusted (JSON parse failure, schema failure, and unsupported-price
guardrail all force a safe human-review fallback instead of crashing or
inventing facts).

## 11. AI qualification — [x]
`lib/leadPipeline.ts` wires lead creation → AI analysis → automation-mode
gating → stage/qualification update → activity log, end to end.

## 12. Inbox — [x]
`/inbox`: lead list + conversation thread, human takeover, approve/edit/
reject AI drafts, opt-out toggle, manual stage change.

## 13. Lead pipeline — [x]
`/leads`: Kanban across New → Contacted → Needs Information → Qualified →
Quote Requested → Booking Ready → Won / Lost / Human Review, manual moves,
AI-driven moves from the analysis pipeline.

## 14. Autopilot modes — [x]
`/automation`: Draft / Safe Autopilot / Autopilot, enforced server-side in
`lib/leadPipeline.ts` and the cron follow-up processor — never in the UI
only. `human_review_required` always overrides the mode, in all three.

## 15. Follow-up engine — [x]
`followup_jobs` table + `/api/cron/followups` (Vercel Cron, every 15 min,
`CRON_SECRET`-gated). Enforces quiet hours by urgency, allowed
communication hours (timezone-aware), max follow-ups, opted-out/declined
detection, and stage-based blocking (Won/Lost/Human Review). Jobs live in
Postgres, so a redeploy or crash never loses one. Cancels on opt-out,
terminal stage, and human takeover.
[!] Real scheduled firing depends on the deployment's cron provider being
configured — can't be verified without an actual deployment.

## 16. Dashboard — [x]
`/dashboard`: every number computed from real queries — new/qualified/
needs-attention/booking-ready/won counts, conversion rate, average first
response time, lead sources, recent activity. Nothing invented.

## 17. Landing page — [x]
Hero, how-it-works, benefits, 24/7, multilingual, features, use cases,
pricing link, FAQ, CTA. No unsupported performance claims.

## 18. Settings — [x]
Business profile (via Knowledge page), automation mode + follow-up config
(Automation page), plan label + data export (real, working JSON download)
+ deletion request logging (Settings page), integrations status page.

## 19. Security review — [x]
- RLS on every tenant table; service-role key used only in the two
  server-only routes that genuinely need it (public intake, cron).
- Defense-in-depth org_id scoping added to server actions beyond RLS.
- Rate limiting + Zod validation on the public intake endpoint; CORS
  scoped to what that one public endpoint needs.
- No secrets in `NEXT_PUBLIC_*` vars or client components (checked by
  grep across `app/` and `components/`).
- PKCE auth callback added so password-reset/signup email links actually
  establish a session (would otherwise silently fail).
- [ ] Formal third-party penetration test — out of scope for an
  autonomous build; recommended before handling real customer data.

## 20. Tests — [x]
93 passing tests, `npm test`:
- Unit: business-hours/timezone math, follow-up policy (opt-out, decline,
  stage blocks, quiet hours, allowed hours, max follow-ups), price-claim
  guardrail, rate limiter, output schema + cross-validation.
- `analyzeLead` unit tests (mocked Anthropic SDK): valid output,
  malformed JSON, schema-invalid JSON, provider/API failure, unsupported
  price claim forcing escalation, multilingual input, empty business
  knowledge.
- Integration tests (`tests/helpers/fakeSupabase.ts`, an in-memory
  Supabase-query-builder fake): lead/conversation/message creation, all
  three automation modes' gating behavior, idempotent duplicate
  submission, tenant isolation, follow-up cancellation, follow-up
  scheduling.
- `tests/ai-scenarios.test.ts`: 30 named scenarios across ~12 languages,
  all recommended_action values, and every escalation trigger in the
  spec (complaint, refund, uncertain price, explicit human request,
  allergy/medical, opted-out) — see the file's header comment for exactly
  what these do and don't prove (schema/guardrail conformance, not live
  Claude calls — no network access in this sandbox).
- [!] No live-Supabase or live-Anthropic end-to-end test run (no
  provisioned project/credentials here) — must be run once real
  credentials exist.

## 21. Production build — [x]
`npm run build`, `npm run typecheck`, and `npm test` all pass clean as of
the last commit.

## 22. Deployment preparation — [x]
Env vars, Supabase/Anthropic/Vercel/domain instructions, and a production
checklist are in `README.md`. `vercel.json` configures the follow-up
cron.
[ ] Actual deployment not performed — no hosting credentials in this
sandbox. Nothing here claims otherwise.

---

## Honesty notes (things a reviewer should know)

- This sandbox has no live Supabase project, no live Anthropic network
  access, and no hosting account — so nothing beyond local build/test
  has actually been run against real infrastructure. Everything above
  marked `[!]` needs that real infrastructure to finish verifying.
- Outbound email/SMS delivery is not integrated with a real provider;
  replies live in the in-app inbox only (see README "Known limitations").
- Stripe billing is intentionally not implemented, per instructions.
