# How Base44 talks to this backend

## 1. The mental model

Base44 is your **client**. This backend is your **server**. They are two separate
programs on two separate machines that only ever meet over HTTPS, exchanging JSON.

```
┌──────────────────────┐                      ┌────────────────────────────┐
│  Base44 app          │                      │  LeadPilot API             │
│  (runs in a browser) │                      │  (runs on your server)     │
│                      │                      │                            │
│  screens & forms     │  ──── request ────►  │  auth → rules → database   │
│                      │       JSON + token   │                            │
│  shows the answer    │  ◄─── response ────  │  AI keys, CRM tokens, DB   │
└──────────────────────┘       JSON           └────────────────────────────┘
        public                                          private
```

Base44 does not need to know *how* anything works. It needs four things only:
the **base URL**, the **token** to prove who the user is, the **endpoints**, and
the **shape of the JSON**. That list is the whole integration.

---

## 2. The contract

**Base URL:** `https://api.leadpilot.app/v1` (locally: `http://localhost:8080/v1`)

The `/v1` matters. When you eventually need a breaking change, you add `/v2` and
old Base44 screens keep working instead of breaking all at once.

> **What exists today:** one endpoint, `POST /api/leads/analyze`, plus
> `GET /api/health`. It is currently mounted under `/api` rather than `/api/v1`
> — worth moving to a versioned prefix before the first real client depends on
> it. See [04-testing-locally.md](04-testing-locally.md) to run it.

**Every request carries a token:**

```
Authorization: Bearer <jwt>
Content-Type: application/json
```

**Every successful response has the same envelope:**

```json
{
  "data": { "id": "lead_01H...", "status": "new" },
  "meta": { "requestId": "req_01H..." }
}
```

**Every list response is paginated the same way:**

```json
{
  "data": [ ... ],
  "meta": { "requestId": "req_01H...", "nextCursor": "eyJpZCI6..." , "hasMore": true }
}
```

**Every error has the same envelope:**

```json
{
  "error": {
    "code": "LEAD_NOT_FOUND",
    "message": "No lead with that id exists in your organization.",
    "details": [],
    "requestId": "req_01H..."
  }
}
```

Why the sameness: your Base44 screens can share one "call the API" helper and one
"show this error" component. Inconsistent response shapes mean every screen
invents its own handling, and that is where frontend bugs breed.

Status codes you will actually use: `200` ok, `201` created, `202` accepted (work
queued), `400` malformed, `401` not logged in, `403` logged in but not allowed,
`404` not found, `409` conflict, `422` validation failed, `429` rate limited,
`500` our bug.

---

## 3. Authentication flow

```
1. User signs in inside the Base44 app, against the identity provider
   (Clerk / Supabase Auth / Auth0).
2. The provider hands the browser a signed JWT.
3. Base44 sends that JWT on every API call:  Authorization: Bearer <jwt>
4. This backend verifies the signature against the provider's public keys
   (AUTH_JWKS_URL), checks it hasn't expired, and reads the user id from it.
5. The backend looks up which organization that user belongs to, and scopes
   every database query to that organization.
```

The important part is step 5. **The frontend never tells the backend which
organization it is.** If Base44 sent `organizationId` in the body and the backend
trusted it, anyone could edit that value and read another company's leads. The
token proves identity; the *server* derives permission.

### Two kinds of caller

| Caller | Credential | Used for |
|---|---|---|
| A logged-in human in Base44 | short-lived **JWT** | everything the UI does |
| A machine — Zapier, a website form, your own cron | **API key** (`X-API-Key`) | server-to-server only |

An API key must **never** be put into Base44, because Base44 code runs in a
browser where anyone can read it. If a public website form needs to create leads,
it posts to your own small server-side endpoint (or a Base44 backend function, if
Base44 offers one), and *that* holds the key.

---

## 4. CORS — the thing that will confuse you first

Browsers block a page on `your-app.base44.app` from calling `api.leadpilot.app`
unless the API explicitly says it's allowed. That permission is CORS.

So: put your Base44 app's published domain into `CORS_ALLOWED_ORIGINS`, and the
backend echoes it back in the response headers. You will see a CORS error in the
browser console at least once. It almost always means the exact origin string is
missing from that list — `https://` vs `http://`, or a trailing slash.

Never set the allowlist to `*` in production. That lets any website on the
internet call your API with your users' browsers.

---

## 5. Slow AI work: don't make the browser wait

An AI analysis can take 10-40 seconds. A browser fetch will often give up first,
and a spinner that long feels broken. So **anything AI-powered returns
immediately with a job, not an answer**:

```
POST /v1/leads/lead_123/analyze
   → 202 Accepted
     { "data": { "jobId": "job_456", "status": "queued" } }

GET /v1/jobs/job_456        (Base44 polls this every 2 seconds)
   → { "data": { "status": "running" } }
   → { "data": { "status": "succeeded", "result": { "analysisId": "an_789" } } }

GET /v1/leads/lead_123/analysis
   → the finished analysis
```

The UI stays responsive, a dropped connection doesn't lose the work, and a failed
AI call can be retried server-side without the user noticing. (Later you can
upgrade polling to server-sent events — but polling is fine, and simpler, for a
long time.)

---

## 6. Rate limits

Every response carries:

```
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 118
X-RateLimit-Reset: 1757692800
```

On `429`, the backend also sends `Retry-After`. Base44 should wait and retry
rather than hammering. AI endpoints get a tighter limit than ordinary reads,
because each one costs you money.

---

## 7. Draft endpoint map

Not final — a target to design against. Grouped by the module that owns it.

Endpoints marked ✅ are implemented; the rest are planned.

```
GET    /api/health                         ✅ is the service up (no auth)
POST   /api/leads/analyze                  ✅ analyze one inquiry (no auth yet)

GET    /v1/health                          # is the service up (no auth)
GET    /v1/me                              # current user + organization

GET    /v1/leads                           # list: filter, sort, cursor paginate
POST   /v1/leads                           # create (also the intake endpoint)
GET    /v1/leads/:id
PATCH  /v1/leads/:id                       # status, owner, priority
DELETE /v1/leads/:id

POST   /v1/leads/:id/inquiries             # attach an incoming message
GET    /v1/leads/:id/inquiries

POST   /v1/leads/:id/analyze               # → 202 + jobId   (AI)
GET    /v1/leads/:id/analysis
POST   /v1/leads/:id/draft-reply           # → 202 + jobId   (AI)

GET    /v1/followups                       # due / upcoming
POST   /v1/followups
PATCH  /v1/followups/:id                   # complete, reschedule

GET    /v1/approvals                       # the human-in-the-loop queue
POST   /v1/approvals/:id/approve           # optionally with an edited payload
POST   /v1/approvals/:id/reject

GET    /v1/activities                      # audit log / activity feed
GET    /v1/jobs/:id                        # background job status

POST   /v1/webhooks/:provider              # inbound (no JWT; HMAC-signed)
```

---

## 8. Checklist before you connect Base44

- [ ] `/v1/health` answers from the deployed URL, not just localhost
- [ ] The Base44 domain is in `CORS_ALLOWED_ORIGINS`
- [ ] A request with no token returns `401`, not a crash
- [ ] A request with a valid token returns only that user's organization's data
- [ ] Error responses use the envelope above
- [ ] No API key, database URL, or provider secret appears anywhere in Base44
