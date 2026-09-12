# Inbound email → lead

An email arrives, and by the time the request returns there is a lead, an
analysis, a full activity trail, and a drafted reply waiting for a human.

**Nothing is ever sent to the customer.** There is no outbound email anywhere in
this system. The end of this pipeline is a draft in the approval queue.

---

## The pipeline

```
email provider  ──POST /api/emails/inbound──►  LeadPilot
                   (signed with HMAC)
                                │
          1. claim the message id ────────► already seen? → DUPLICATE_IGNORED, stop
                                │
          2. match sender by email ───────► found?  update it
                                             none?  create a lead
                                │
          3. EMAIL_RECEIVED  +  LEAD_CREATED_FROM_EMAIL | EMAIL_LINKED_TO_LEAD
                                │
          4. analyze (same logic as POST /api/leads/analyze)
                                │            └─ fails? LEAD_ANALYSIS_FAILED,
                                │               keep the lead, stop
                                │
          5. store temperature / intent / urgency / mainNeed /
             recommendedAction / suggestedReply on the lead
                                │
          6. REPLY_GENERATED  (sent: false)
                                │
          7. approval required? → an approval item, PENDING, HIGH risk
```

## Why the endpoint is not token-authenticated

Every other route needs `Authorization: Bearer <LEADPILOT_API_TOKEN>`. This one
cannot: an email provider has no way to know that token.

Instead the provider signs each request body with `EMAIL_WEBHOOK_SECRET`, and
the backend recomputes that signature over the **raw bytes** and compares in
constant time. A forged request fails because an attacker cannot produce a valid
signature without the secret.

With no secret configured the endpoint returns **503, never 200** — a missing
variable must not leave a public write endpoint standing open.

## The payload

LeadPilot defines its own format. Providers are translated into it by a small
adapter, so switching provider never touches the pipeline.

```json
{
  "messageId": "CAF=abc123@mail.gmail.com",
  "from":      { "email": "anna@example.com", "name": "Anna Schmidt" },
  "to":        "hello@yourcleaning.example",
  "subject":   "Cleaning quote for next Friday?",
  "textBody":  "Hi, I need my apartment cleaned next Friday...",
  "htmlBody":  "<p>optional</p>",
  "receivedAt": "2026-09-12T09:15:00.000Z",
  "attachments": [
    { "filename": "floorplan.pdf", "contentType": "application/pdf", "size": 20481 }
  ]
}
```

Headers: `Content-Type: application/json` and `X-Webhook-Signature: <hex>`
(`sha256=<hex>` is accepted too).

**Attachment content is never accepted or stored** — metadata only.

## Responses

| Situation | Status | `outcome` |
|---|---|---|
| Processed | 200 | `PROCESSED` |
| Seen before | 200 | `DUPLICATE_IGNORED` |
| Lead created, AI failed | 200 | `RECEIVED_ANALYSIS_FAILED` |
| Bad or missing signature | 401 | — |
| Malformed payload | 422 | — |
| No `EMAIL_WEBHOOK_SECRET` | 503 | — |

Anything the provider should not retry answers **200**, a duplicate included. A
non-2xx makes most providers send the same email again.

## Duplicates

The message id is **claimed before any work starts**, atomically. A retry that
arrives while the first attempt is still running cannot also create a lead.

> **Known gap:** that memory lives in the process, so a restart or redeploy
> forgets it and an already-processed email could be handled a second time. The
> real fix is a unique column in the database (Phase 1).

## When analysis fails

The email is not lost. The lead exists, the arrival is recorded, and
`LEAD_ANALYSIS_FAILED` appears in the activity feed. What is missing is the
analysis and the draft.

The message id stays claimed, so a provider retry will not create a second lead
— which also means the analysis is not retried automatically. Re-analysis
belongs to the background job queue that arrives with the database.

The activity entry records the error *type*, never the raw error: upstream
messages can quote the request, and that could include the customer's words.

## What is deliberately kept out of storage

The activity log is never deleted, so what lands there lands there forever:

- **The email body never enters an activity entry.** Only its length.
- **Attachment filenames are not logged.** Only the count.
- **The subject and a 500-character preview** are stored on the *lead* (a lead
  list is useless without them) but not in the permanent log.
- Metadata passes through the same secret redaction as everything else.

## Configuration

| Variable | Purpose |
|---|---|
| `EMAIL_WEBHOOK_SECRET` | Verifies the webhook. Required in production. |
| `EMAIL_DEFAULT_BUSINESS_TYPE` | Context for the AI — a provider cannot know your trade |
| `EMAIL_DEFAULT_SERVICES` | Comma-separated |
| `EMAIL_DEFAULT_LANGUAGE` | Language for the drafted reply |
| `EMAIL_APPROVAL_REQUIRED` | `true` — queue the draft for a human |

No mailbox password. No IMAP credentials. No outbound key. The backend never
logs into an inbox and never sends anything.

## Testing it without a provider

`tests/integration/emailIngestion.test.ts` covers the whole pipeline offline —
new lead, existing sender, duplicate, malformed payload, analysis failure,
approval creation, signature forgery, and that customer content stays out of the
permanent log.

To try it by hand against a running server, see the `send()` helper pattern:
sign the exact body bytes with `EMAIL_WEBHOOK_SECRET` and POST them.

## Still to come (Stage 2)

- A provider adapter translating their JSON into the format above
- The provider account, and forwarding your real inbox to it
