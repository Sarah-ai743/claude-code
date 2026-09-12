# LeadPilot API

Backend for **LeadPilot** — a SaaS that helps service businesses manage incoming
leads, analyze inquiries, prioritize opportunities, prepare responses, schedule
follow-ups, and automate repetitive sales work.

The frontend is built in **Base44**. This repository is the REST API it talks to,
and the only place secrets, business rules, and AI calls live.

> **Current status: architecture only.** This repo holds the design documents and
> an empty folder skeleton. No product code has been written yet — that starts at
> Phase 0 in the build order below.

## Read these in order

| Document | What it answers |
|---|---|
| [docs/01-architecture.md](docs/01-architecture.md) | Which technologies, which folders, and *why* each choice was made |
| [docs/02-base44-integration.md](docs/02-base44-integration.md) | How Base44 authenticates and calls this API, plus the draft endpoint map |
| [docs/03-build-order.md](docs/03-build-order.md) | What to build first, phase by phase, and what to deliberately skip |

## The stack, in one line

TypeScript on Node.js · Express · PostgreSQL with Prisma · Zod validation · JWTs
from a managed identity provider · Pino logging · Anthropic behind a provider
interface · deployed as a Docker image on Railway or Render.

## Non-negotiables

1. **No secret ever reaches the browser.** API keys, database URLs, and provider
   tokens live only in this backend's environment variables.
2. **Every table and every query is scoped to an `organization_id`.** This is a
   multi-tenant SaaS; showing one customer another customer's leads is fatal.
3. **The AI never acts on the outside world by itself.** It writes a proposal; a
   human approves it; only then does a job execute it.
4. **Everything that happens gets an audit row**, in the same transaction as the
   change, recording whether the actor was a person, the AI, or an integration.

## Getting started (once Phase 0 begins)

```bash
cp .env.example .env     # then fill in real values — .env is never committed
npm install
npm run dev
```
