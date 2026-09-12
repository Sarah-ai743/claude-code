# src/jobs/

Anything slow, retryable, or scheduled runs here instead of inside a request:
AI analysis, sending an approved email, syncing a CRM, nightly automation.

**Start with a `jobs` table in Postgres and a worker loop that polls it.** You can
see the rows, you can retry by hand, and you do not need Redis on day one. Move to
BullMQ + Redis when volume actually demands it — the handler code will not change.

```
jobs/
├── queue.ts        enqueue(type, payload, opts)
├── worker.ts       the loop: claim → run → mark done/failed → retry with backoff
└── handlers/       one file per job type, keyed by the job's `type` column
```

Rules: every job is **idempotent** (running it twice must not send two emails —
key on an idempotency token), has a **max attempt count**, records its **last
error**, and writes an **audit row** when it changes anything a user would notice.

The worker runs as a second process from the same Docker image with a different
start command — shared types, shared services, no duplicated logic.
