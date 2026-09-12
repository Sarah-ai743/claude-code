# src/modules/

One folder per business concept. Every module has the same five files, on purpose
— learn one, and you know them all:

```
<module>.routes.ts       URL paths → controller functions. No logic.
<module>.controller.ts   Reads the HTTP request, calls the service, shapes the
                         response. No business rules.
<module>.service.ts      THE BUSINESS RULES. Knows nothing about HTTP.
<module>.repository.ts   Database queries only. Knows nothing about rules.
<module>.schema.ts       Zod schemas for input and output.
```

| Module | Owns |
|---|---|
| `health/` | Liveness and readiness checks. Build this first. |
| `auth/` | Token verification, current user, API keys. |
| `organizations/` | Tenants, members, roles, plans, settings. |
| `leads/` | The core object: an incoming opportunity. |
| `inquiries/` | The raw messages a lead sent you. |
| `analysis/` | AI output about an inquiry: summary, intent, urgency, score. |
| `replies/` | Drafted responses and their delivery state. Never auto-sent. |
| `followups/` | Scheduled next touches. |
| `approvals/` | The human-in-the-loop queue. Nothing outbound happens without it. |
| `audit/` | Append-only activity log. Written inside the same transaction as the change. |
| `webhooks/` | Inbound events (HMAC-verified) and outbound notifications (HMAC-signed). |

Cross-module calls go **service → service**, never controller → controller, and
never by reaching into another module's repository.
