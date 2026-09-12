# LeadPilot API

Backend for **LeadPilot** — a SaaS that helps service businesses manage incoming
leads, analyze inquiries, prioritize opportunities, prepare responses, schedule
follow-ups, and automate repetitive sales work.

The frontend is built in **Base44**. This repository is the REST API it talks to,
and the only place secrets, business rules, and AI calls live.

> **Current status:** the architecture is designed, and four features are
> built — lead analysis, follow-up suggestion, the human approval queue, and
> the activity log every one of them writes to. There is no database and no authentication yet, and
> nothing is ever sent to a customer: approving records a decision and executes
> nothing. See [docs/03-build-order.md](docs/03-build-order.md).

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

## Run it locally

```bash
npm install
cp .env.example .env     # .env is git-ignored and never committed

# Option A — no API key needed, no cost. Set AI_PROVIDER=mock in .env
npm run dev

# Option B — real AI. Set AI_PROVIDER=anthropic and a real ANTHROPIC_API_KEY
npm run dev
```

Then, in another terminal:

```bash
curl http://localhost:8080/api/health

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

Three more features sit on top: `POST /api/followups/suggest` decides whether a
lead should be chased and drafts the message, `/api/approvals` is the queue
where a human approves or rejects those drafts, and `GET /api/activity` is the
append-only record of everything that happened. Full walkthrough of all four,
including what every failure looks like:
**[docs/04-testing-locally.md](docs/04-testing-locally.md)**

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start with auto-reload on file changes |
| `npm test` | Run the test suite (always uses the mock AI provider) |
| `npm run typecheck` | Check types without emitting files |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled build |
