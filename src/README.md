# src/

Application code. The dependency rule points one way only:

```
routes → controller → service → repository → database
                         │
                         ├→ ai/
                         ├→ integrations/
                         └→ jobs/
```

Nothing lower ever imports something higher. A repository must not know that HTTP
exists; a service must not know which web framework you use. That one rule is
what keeps the codebase testable as it grows.

| Folder | Holds |
|---|---|
| `config/` | Reads and validates environment variables. Boot fails loudly if any are missing. |
| `middleware/` | Cross-cutting request handling: request id, logging, CORS, rate limits, auth, validation, error handling. |
| `modules/` | The business, one folder per concept. See `modules/README.md`. |
| `ai/` | Provider abstraction and business-named AI tasks. See `ai/README.md`. |
| `integrations/` | Email, calendar, CRM — the outside world, each behind an interface. |
| `jobs/` | Background work: the queue, the worker loop, and one handler per job type. |
| `db/` | Prisma schema, migrations, and the shared client. |
| `lib/` | Small shared helpers: errors, logger, ids, pagination. |
| `types/` | Shared TypeScript types. |

Two files at this level: `server.ts` starts the HTTP listener and nothing else;
`app.ts` builds the Express app (middleware + routes) so tests can import it
without opening a port.
