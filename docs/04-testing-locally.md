# Testing `POST /api/leads/analyze` locally

Everything below runs on your own machine. Nothing is deployed, and no database
is involved yet.

---

## 1. Prerequisites

Node.js 22 or newer:

```bash
node -v      # must print v22.x or higher
```

---

## 2. Install and configure

```bash
npm install
cp .env.example .env
```

Now open `.env` and choose one of two modes.

### Mode A — mock AI (start here)

No API key, no cost, instant answers. Ideal for wiring up Base44 screens.

```bash
AI_PROVIDER=mock
CORS_ALLOWED_ORIGINS=http://localhost:3000,https://your-app.base44.app
```

### Mode B — real AI

```bash
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...your real key...
AI_MODEL_DEFAULT=claude-opus-5
```

Each call in this mode costs real money — cents, not dollars, but not zero.

> If a required variable is missing, the server refuses to start and tells you
> exactly which one. That is deliberate, not a bug.

---

## 3. Start the server

```bash
npm run dev
```

You should see two lines of JSON:

```json
{"level":30,"provider":"mock","model":"claude-opus-5","msg":"ai.provider_selected"}
{"level":30,"port":8080,"env":"development","msg":"server.started"}
```

Leave this running and open a **second terminal** for the requests below.

---

## 4. Check the server is alive

```bash
curl http://localhost:8080/api/health
```

```json
{"data":{"status":"ok","environment":"development","aiProvider":"mock","uptimeSeconds":3}}
```

If this fails, nothing else will work — fix it first.

---

## 5. The real request

```bash
curl -X POST http://localhost:8080/api/leads/analyze \
  -H 'Content-Type: application/json' \
  -d '{
    "message": "Hi, I need my apartment cleaned next Friday. It has 3 bedrooms. Can you tell me the price?",
    "customerName": "Anna",
    "companyContext": {
      "businessType": "Cleaning Company",
      "services": ["Home Cleaning", "End of Tenancy Cleaning"],
      "language": "English"
    }
  }'
```

**On Windows PowerShell**, `curl` behaves differently — use this instead:

```powershell
Invoke-RestMethod -Uri http://localhost:8080/api/leads/analyze -Method Post `
  -ContentType 'application/json' `
  -Body '{"message":"Hi, I need my apartment cleaned next Friday. It has 3 bedrooms. Can you tell me the price?","customerName":"Anna","companyContext":{"businessType":"Cleaning Company","services":["Home Cleaning"],"language":"English"}}'
```

### What you get back

```json
{
  "data": {
    "temperature": "HOT",
    "intent": "Requesting a price for a service",
    "urgency": "HIGH",
    "mainNeed": "Service enquiry described in the customer message",
    "recommendedAction": "Reply with a quote after confirming the missing details",
    "suggestedReply": "Hi, thanks for getting in touch...",
    "confidence": 0.75
  },
  "meta": {
    "requestId": "req_c2c18138-773e-4fc8-8860-ed50f7898c90",
    "model": "mock-model",
    "promptVersion": "analyze-lead.v1",
    "latencyMs": 1
  }
}
```

`data` is exactly the seven fields you specified. `meta` is operational
information — which model answered, which prompt version, how long it took, and
the request id to quote if you need to find this exact call in the logs.

Pretty-print it by piping through Python:

```bash
curl -s -X POST ... | python3 -m json.tool
```


---

## 5b. The second endpoint: `POST /api/followups/suggest`

Decides whether a lead should be chased, when, and with what message.

```bash
curl -X POST http://localhost:8080/api/followups/suggest \
  -H 'Content-Type: application/json' \
  -d '{
    "messageHistory": [
      { "sender": "CUSTOMER", "message": "Hi, I need my apartment cleaned next Friday. Can you tell me the price?", "sentAt": "2026-09-04T09:00:00.000Z" },
      { "sender": "BUSINESS", "message": "Hi Anna, happy to help. Is it a 3-bedroom apartment?", "sentAt": "2026-09-04T13:00:00.000Z" }
    ],
    "leadStatus": "CONTACTED",
    "leadTemperature": "WARM",
    "lastContactAt": "2026-09-04T13:00:00.000Z",
    "customerName": "Anna",
    "companyContext": {
      "businessType": "Cleaning Company",
      "services": ["Home Cleaning"],
      "language": "English",
      "tone": "FRIENDLY",
      "timezone": "Europe/Berlin"
    }
  }'
```

> Use timestamps in the **past** — several days back. A follow-up is refused if
> the last contact was too recent, which is the anti-spam rule working.

```json
{
  "data": {
    "shouldFollowUp": true,
    "reason": "The customer asked a question and has not had a reply with the detail they need.",
    "recommendedFollowUpTime": "2026-09-16T07:00:00.000Z",
    "suggestedMessage": "Hi, just checking you have everything you need from us...",
    "urgency": "MEDIUM"
  },
  "meta": {
    "aiCalled": true,
    "policy": { "blocked": false, "code": null, "timezone": "Europe/Berlin" },
    "approval": {
      "required": true,
      "status": "PENDING_HUMAN_APPROVAL",
      "note": "This is a draft only. Nothing has been sent, scheduled, or queued..."
    }
  }
}
```

`07:00Z` is 09:00 in Berlin on a Wednesday — the time is always computed in the
business's timezone and snapped inside working hours.

### The rules, and how to see each one fire

`meta.policy.code` tells you which rule stopped a follow-up. When a rule blocks,
`suggestedMessage` and `recommendedFollowUpTime` are `null` — a message that
must not be sent should not exist in a form somebody can copy and paste — and
`meta.aiCalled` is `false`, so a blocked lead costs nothing.

| Try this | You get |
|---|---|
| A customer message saying `"Please stop contacting me."` | `CUSTOMER_OPTED_OUT` |
| `"We're not interested, thanks"` | `CUSTOMER_DECLINED` |
| `leadStatus: "LOST"` | `LEAD_CLOSED_LOST` |
| `leadStatus: "WON"` | `LEAD_CLOSED_WON` |
| `lastContactAt` 2 hours ago on a `HOT` lead | `TOO_SOON` (+ `earliestAllowedAt`) |
| Three `BUSINESS` messages in a row with no customer reply | `TOO_MANY_UNANSWERED` |

The quiet period depends on how warm the lead is: **HOT 24h, WARM 72h,
COLD 168h**.

### What this endpoint deliberately does not do

- **It never sends anything.** No email, no SMS, no scheduled job. It returns a
  draft, and `meta.approval.required` is always `true`.
- **It never lets the AI overrule a rule.** The anti-spam and opt-out checks run
  *before* the model is consulted, so the model is never even asked about a lead
  it is not allowed to chase. The model can still veto a follow-up the rules
  permitted — it can only ever turn a follow-up off, never on.
- **It never asks the model for a calendar date.** The model returns "wait N
  hours"; the timestamp is computed in code, in the business's timezone. Models
  are unreliable at date arithmetic.

---

## 6. Check the failure paths too

A feature is not working until its errors work. Try each of these:

**Missing / too-short message → `422`**

```bash
curl -i -X POST http://localhost:8080/api/leads/analyze \
  -H 'Content-Type: application/json' -d '{"message":"hi"}'
```

```json
{"error":{"code":"VALIDATION_FAILED","message":"The request body is invalid.",
 "details":[{"field":"message","message":"message must be at least 10 characters to analyze","code":"too_small"},
            {"field":"companyContext","message":"Invalid input: expected object, received undefined","code":"invalid_type"}],
 "requestId":"req_..."}}
```

Every invalid field is reported at once, with the field name — so a Base44 form
can highlight all of them in one pass.

**Unknown route → `404`**

```bash
curl -i http://localhost:8080/api/nope
```

**Wrong method → `404`**

```bash
curl -i http://localhost:8080/api/leads/analyze      # GET, not POST
```

**Bad API key (Mode B only) → `502` with code `AI_PROVIDER_ERROR`.** Note what
the response does *not* contain: no stack trace, no upstream error text. That
detail is in your server terminal, tied to the same `requestId`.

---

## 7. Run the automated tests

```bash
npm test
```

```
✓ tests/unit/businessTime.test.ts (13 tests)
✓ tests/unit/followupsPolicy.test.ts (31 tests)
✓ tests/unit/guardrails.test.ts (6 tests)
✓ tests/unit/leadAnalysisSchema.test.ts (5 tests)
✓ tests/integration/analyzeLead.test.ts (11 tests)
✓ tests/integration/suggestFollowUp.test.ts (16 tests)

Test Files  6 passed (6)
     Tests  82 passed (82)
```

The tests force `AI_PROVIDER=mock`, so they never call a real API, never need a
key, and never cost anything — they run in under a second and work offline.

Other checks:

```bash
npm run typecheck    # types only, no files written
npm run build        # compile to dist/
```

---

## 8. Calling it from Base44

Once curl works, point a Base44 action at the same URL with the same JSON body.
Two things to get right:

1. **CORS.** Add your Base44 app's exact origin to `CORS_ALLOWED_ORIGINS` in
   `.env` and restart. A browser request from an origin that is not listed will
   fail with a CORS error in the console, even though curl works fine.
2. **`localhost` is your machine only.** A published Base44 app cannot reach
   `http://localhost:8080`. For testing against the published frontend, expose
   your local server with a tunnel (`npx localtunnel --port 8080`, ngrok, or
   Cloudflare Tunnel), or deploy the API first.

---

## 9. When something goes wrong

| Symptom | Cause and fix |
|---|---|
| `Invalid environment configuration` at startup | A required variable is missing from `.env`. The message names it. |
| `ANTHROPIC_API_KEY is required when AI_PROVIDER=anthropic` | Either add a real key, or set `AI_PROVIDER=mock`. |
| `EADDRINUSE: address already in use` | Something else is on port 8080. Change `PORT` in `.env`, or stop the other process. |
| `Cannot find module` | Run `npm install`. |
| `502 AI_PROVIDER_ERROR` | The AI call failed. Look in the server terminal for the full reason, matched by `requestId`. |
| `429 AI_RATE_LIMITED` | Too many calls to the provider too quickly. Wait and retry. |
| CORS error in the browser, but curl works | The origin is missing from `CORS_ALLOWED_ORIGINS`. Match it exactly, including `https://` and no trailing slash. |
| Responses are always identical | You are in `AI_PROVIDER=mock`. That is the mock fixture, not the model. |

---

## 10. Reading the logs

Every line is JSON, and every line carries the `requestId`:

```json
{"level":30,"requestId":"req_c2c...","temperature":"HOT","urgency":"HIGH",
 "confidence":0.75,"model":"mock-model","promptVersion":"analyze-lead.v1",
 "latencyMs":1,"messageLength":90,"msg":"lead.analysis.completed"}
```

Note what is **not** logged: the customer's message and the drafted reply. Those
contain personal information, and logs are the wrong place for it. Only the
length is recorded.

One log line to watch for:

```json
{"level":40,"msg":"lead.analysis.unsupported_price_claim","amounts":["£150"]}
```

That means the AI put a price in its draft that the customer never mentioned —
in other words, it invented a fact. The draft is still returned (a human reviews
it before sending), but the warning tells you the prompt needs tightening.
