import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createLeadAndAnalyze } from "@/lib/leadPipeline";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

// This endpoint is meant to be called from a business's own website (per
// the Integrations page), so it allows cross-origin requests. It never
// uses cookies/credentials, is rate-limited per IP, and every write is
// validated and scoped to the single org resolved from `slug` — a
// permissive CORS policy here does not widen access to any tenant data.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

const PublicLeadSchema = z.object({
  slug: z.string().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(50).optional().nullable(),
  message: z.string().trim().min(1).max(5000),
  idempotencyKey: z.string().max(200).optional().nullable(),
});

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  const limit = rateLimit(`leads-public:${ip}`, 10, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { ...CORS_HEADERS, "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400, headers: CORS_HEADERS });
  }

  const parsed = PublicLeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input.", details: parsed.error.flatten() },
      { status: 400, headers: CORS_HEADERS },
    );
  }
  const input = parsed.data;

  const supabase = createAdminClient();
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", input.slug)
    .maybeSingle();

  if (orgError || !org) {
    return NextResponse.json({ error: "Unknown business." }, { status: 404, headers: CORS_HEADERS });
  }

  try {
    const result = await createLeadAndAnalyze(supabase, org.id, {
      name: input.name,
      email: input.email,
      phone: input.phone,
      message: input.message,
      idempotencyKey: input.idempotencyKey,
      source: "public_form",
    });

    return NextResponse.json(
      {
        leadId: result.leadId,
        status: result.deduplicated ? "duplicate" : "received",
      },
      { status: 201, headers: CORS_HEADERS },
    );
  } catch (error) {
    // The lead itself may already be stored even if a later step (e.g. an
    // activity_log insert) failed — this never silently drops the write
    // that matters (the `leads` row is created first, before AI analysis
    // is even attempted). Surface a 500 so the client can retry/report.
    console.error("lead intake failed", error);
    return NextResponse.json({ error: "Failed to process lead. Please try again." }, { status: 500, headers: CORS_HEADERS });
  }
}
