import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Exports the caller's own organization data as JSON. Uses the
 * request-scoped (RLS-enforced) client, not the service role — so this
 * can only ever return the signed-in user's own org, never another
 * tenant's, regardless of what's requested.
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
  if (!profile?.org_id) return NextResponse.json({ error: "No organization." }, { status: 404 });

  const [org, services, serviceAreas, faqs, pricingRules, qualificationQuestions, leads, conversations, messages] =
    await Promise.all([
      supabase.from("organizations").select("*").eq("id", profile.org_id).single(),
      supabase.from("services").select("*").eq("org_id", profile.org_id),
      supabase.from("service_areas").select("*").eq("org_id", profile.org_id),
      supabase.from("faqs").select("*").eq("org_id", profile.org_id),
      supabase.from("pricing_rules").select("*").eq("org_id", profile.org_id),
      supabase.from("qualification_questions").select("*").eq("org_id", profile.org_id),
      supabase.from("leads").select("*").eq("org_id", profile.org_id),
      supabase.from("conversations").select("*").eq("org_id", profile.org_id),
      supabase.from("messages").select("*").eq("org_id", profile.org_id),
    ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    organization: org.data,
    services: services.data,
    serviceAreas: serviceAreas.data,
    faqs: faqs.data,
    pricingRules: pricingRules.data,
    qualificationQuestions: qualificationQuestions.data,
    leads: leads.data,
    conversations: conversations.data,
    messages: messages.data,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="leadpilot-export-${profile.org_id}.json"`,
    },
  });
}
