# src/ai/

Business code must never import a vendor SDK directly. It calls a *task*; the task
calls a *provider*; only the provider knows which company is on the other end.

```
providers/   One small interface, several implementations.
             complete(messages, opts)
             completeStructured(messages, schema, opts)
             → anthropic.ts (default), openai.ts, mock.ts

tasks/       Named after business outcomes, not prompts:
             scoreLead.ts, analyzeInquiry.ts, draftReply.ts, summarizeThread.ts

prompts/     Prompt text as versioned files. Store the version on every result
             row so you can tell which prompt produced which output.
```

Rules:

1. **Always request structured output** against a schema, then validate the result
   with Zod. Unexpected model output is a caught error, not a crash later on.
2. **`mock.ts` is a first-class provider.** `AI_PROVIDER=mock` runs the whole test
   suite offline, instantly, for free.
3. **Log every call** to `ai_requests`: model, tokens, cost, latency, and the lead
   it was for. Without it you cannot explain your AI bill or measure a prompt change.
4. **Every call has a timeout, a retry policy, and a per-organization spend guard.**
5. Default model `claude-opus-5`; `claude-haiku-4-5` for high-volume classification.
   Model ids are configuration (`AI_MODEL_DEFAULT`), never hardcoded in business code.
