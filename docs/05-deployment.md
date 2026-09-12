# Deploying LeadPilot, and connecting Base44

Written for someone deploying a backend for the first time. Follow it in order.

> **This document contains no URL for your API**, because it does not exist yet.
> Your hosting provider gives you one at the end of step 4, and that is the only
> real value. Anything else would be a guess.

---

## What you are about to do

Right now the API runs only on your own machine, at `http://localhost:8080`.
`localhost` means *this computer* — nobody else on the internet can reach it,
including Base44.

Deploying means: put the same code on a computer that is always on and has a
public address. Four things have to be true before Base44 can connect:

1. The code runs somewhere public.
2. It has a real API token, so strangers cannot use it.
3. Base44 knows the address and the token.
4. CORS allows your Base44 app, **if** the calls come from the browser.

---

## Step 1 — Check it is ready to leave your machine

```bash
npm install
npm test          # 185 tests, all should pass
npm run typecheck
npm run build     # must produce dist/ with no errors
```

If any of these fail, fix that first. A deploy will not fix it.

---

## Step 2 — Generate the API token

**Never invent a token by hand.** A human-chosen string is guessable; a
generated one is not. On macOS or Linux:

```bash
openssl rand -hex 32
```

On Windows PowerShell:

```powershell
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
```

Or with Node, on any system:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

You get 64 characters of hex. That is your `LEADPILOT_API_TOKEN`.

**Handling it:**

- Paste it straight into your password manager, and into the two dashboards
  below. Nowhere else.
- Never commit it. Never put it in a screenshot, a chat message, or a git
  commit — including a chat with an AI assistant.
- It is a password for your whole API. Anyone who has it can read every lead
  and spend your AI budget.
- The server refuses to start if the token is shorter than 32 characters or if
  it is still the placeholder from `.env.example`. That is on purpose.

Try it locally first — put it in your `.env`, restart, and confirm:

```bash
curl -i http://localhost:8080/api/activity                                  # 401
curl -i -H "Authorization: Bearer <your token>" http://localhost:8080/api/activity  # 200
```

---

## Step 3 — Push the code

The hosting providers below deploy from GitHub. Make sure your work is pushed:

```bash
git status        # should be clean
git push
```

`.env` is git-ignored, so your secrets do not travel with the code. That is
exactly right — they go into the hosting dashboard instead.

---

## Step 4 — Deploy

Either provider is fine. Railway is slightly simpler; Render has a free tier
that sleeps when idle (the first request after a sleep takes ~30 seconds).

**Railway** (railway.app): New Project → Deploy from GitHub repo → pick this
repository and the branch.

**Render** (render.com): New → Web Service → connect the repository.

If asked for commands:

| Setting | Value |
|---|---|
| Build command | `npm ci && npm run build` |
| Start command | `npm start` |
| Node version | 22 or newer |
| Health check path | `/api/health` |

There is also a `Dockerfile` in the repo if you prefer a container deploy — most
platforms detect it automatically. Either route runs the same thing in the end:
`node dist/server.js`.

**Do not set `PORT` yourself.** The platform assigns one and passes it in; the
config already reads it.

When the deploy finishes, the platform shows you a URL. It looks something like
`https://something-something.up.railway.app` or
`https://something.onrender.com`. **That URL is the only real one — copy it
from the dashboard, do not type one from memory.**

---

## Step 5 — Set the environment variables

In your hosting dashboard, find **Variables** / **Environment**. Add:

| Variable | Value | Why |
|---|---|---|
| `NODE_ENV` | `production` | Turns on production behaviour and makes the token mandatory |
| `LEADPILOT_API_TOKEN` | the token from step 2 | Without it the server refuses to start |
| `AI_PROVIDER` | `anthropic` | Use the real model. `mock` if you want to test the plumbing first, free |
| `ANTHROPIC_API_KEY` | your Anthropic key | Required when `AI_PROVIDER=anthropic` |
| `CORS_ALLOWED_ORIGINS` | your Base44 app's exact origin | Only needed if the browser calls the API — see step 7 |
| `LOG_LEVEL` | `info` | Optional |

Everything else has a sensible default.

These values live only in this dashboard. They are never in the code, never in
git, and never sent to Base44.

The server validates all of this at startup: if something required is missing,
the deploy fails immediately with a message naming the variable, rather than
starting up and failing on a customer's first request.

---

## Step 6 — Check it from the outside

Replace `<your-url>` with the real URL from step 4:

```bash
# 1. Alive? Public, no token needed.
curl https://<your-url>/api/health
# -> {"data":{"status":"ok","uptimeSeconds":12}}

# 2. Protected? This must be refused.
curl -i https://<your-url>/api/activity
# -> HTTP/1.1 401  {"error":{"code":"MISSING_API_TOKEN", ...

# 3. Works with the token?
curl -i -H "Authorization: Bearer <your token>" https://<your-url>/api/activity
# -> HTTP/1.1 200  {"data":[], ...
```

**All three must behave as shown.** If #2 returns 200, stop and fix it before
going any further — your API is open to the internet.

---

## Step 7 — Connect Base44

`LEADPILOT_API_BASE_URL` = your deployed URL with `/api` on the end, and **no
trailing slash**:

```
https://<your-url>/api
```

so that Base44 builds `…/api/leads/analyze` from `…/api` + `/leads/analyze`.
Check which way your Base44 action is written: if it already includes `/api` in
each path, set the base URL to `https://<your-url>` instead. The test is that
the final URL has exactly one `/api` in it.

`LEADPILOT_API_TOKEN` = the token from step 2, sent as:

```
Authorization: Bearer <token>
```

(`X-API-Token: <token>` also works, if that is easier to configure.)

### The one thing to get right: where the call comes from

This matters more than anything else on this page.

- **Server-side call** (a Base44 backend function or server action) — correct.
  The token stays on Base44's server, and CORS does not apply because there is
  no browser involved.
- **Browser call** (fetch from a page in your app) — **the token is public.**
  Anyone who opens developer tools can read it, copy it, and call your API
  directly. A "secret" that reaches a browser is not a secret.

Base44 calls these values *secrets*, which suggests server-side use. Configure
it that way. If the only option is a call from the browser, then the honest fix
is not a shared token at all — it is per-user login (Phase 1 in
[03-build-order.md](03-build-order.md)), where each user gets their own
short-lived token and the backend decides what they may see.

### CORS — only if the browser calls the API

Set `CORS_ALLOWED_ORIGINS` to your Base44 app's exact published origin:

```
CORS_ALLOWED_ORIGINS=https://your-app.base44.app
```

Exact means exact: `https://` not `http://`, no trailing slash, no path. A
mismatch shows up as a CORS error in the browser console while `curl` keeps
working perfectly — that combination is the symptom.

---

## Rotating the token

If a token is ever exposed, replace it — do not hope:

1. Generate a new one (step 2).
2. Set `LEADPILOT_API_TOKEN` to **both**, comma-separated:
   `<new-token>,<old-token>`. Both now work.
3. Update Base44 to the new token.
4. Remove the old one from the variable.

No downtime, and nothing breaks mid-switch.

---

## What is deliberately not done yet

Be aware of these before you put real customer data in:

- **No rate limiting.** Anyone holding the token can call the AI endpoints as
  fast as they like, and each call costs money. Worth adding before you share
  the token widely.
- **No database.** Approvals and activity live in memory and are lost on every
  restart or redeploy. Phase 1.
- **One token for everything.** The token says "a trusted system is calling",
  not "this is Anna". Until per-user login exists, anything holding it can reach
  every endpoint and every lead.
- **Nothing is ever sent to a customer.** Approving records a decision; no email
  integration exists. That is by design for now.
