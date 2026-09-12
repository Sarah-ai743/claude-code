# src/integrations/

The outside world. Each provider sits behind an interface the rest of the app owns,
exactly like `ai/providers` — so swapping Resend for Postmark, or HubSpot for
Pipedrive, touches one folder.

```
email/       send(), delivery status webhooks    (Resend / Postmark / SES)
calendar/    availability, create event          (Google Calendar first)
crm/         push/pull contacts and deals        (HubSpot first)
```

Rules:

- **OAuth tokens are encrypted at rest** with `ENCRYPTION_KEY` and stored on the
  `integrations` table, scoped to an organization.
- **Never call an integration directly from a controller.** Outbound actions run
  through the approvals queue and then a job, so they are auditable and retryable.
- **Treat every third-party call as unreliable**: timeout, retry with backoff,
  and a clear error when it finally fails.
- **Verify inbound webhooks** with an HMAC signature over the raw body before you
  parse it, and reject stale timestamps to block replays.
