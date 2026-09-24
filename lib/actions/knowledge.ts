"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";

async function orgScopedClient() {
  const { org } = await requireOrg();
  const supabase = createClient();
  return { supabase, orgId: org.id };
}

export async function updateOrgProfile(formData: FormData): Promise<void> {
  const { supabase, orgId } = await orgScopedClient();

  const languages = String(formData.get("languages") ?? "")
    .split(",")
    .map((l) => l.trim())
    .filter(Boolean);

  await supabase
    .from("organizations")
    .update({
      name: String(formData.get("name") ?? ""),
      industry: String(formData.get("industry") ?? "") || null,
      country: String(formData.get("country") ?? "") || null,
      timezone: String(formData.get("timezone") ?? "UTC"),
      currency: String(formData.get("currency") ?? "USD").toUpperCase(),
      languages,
      website: String(formData.get("website") ?? "") || null,
      description: String(formData.get("description") ?? "") || null,
      booking_url: String(formData.get("bookingUrl") ?? "") || null,
      contact_email: String(formData.get("contactEmail") ?? "") || null,
      contact_phone: String(formData.get("contactPhone") ?? "") || null,
      brand_tone: String(formData.get("brandTone") ?? "") || null,
      ai_instructions: String(formData.get("aiInstructions") ?? "") || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orgId);

  revalidatePath("/knowledge");
  revalidatePath("/settings");
}

export async function addService(formData: FormData): Promise<void> {
  const { supabase, orgId } = await orgScopedClient();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await supabase.from("services").insert({
    org_id: orgId,
    name,
    description: String(formData.get("description") ?? "") || null,
    pricing_note: String(formData.get("pricingNote") ?? "") || null,
  });
  revalidatePath("/knowledge");
}

export async function deleteService(formData: FormData): Promise<void> {
  const { supabase, orgId } = await orgScopedClient();
  await supabase.from("services").delete().eq("id", String(formData.get("id"))).eq("org_id", orgId);
  revalidatePath("/knowledge");
}

export async function addServiceArea(formData: FormData): Promise<void> {
  const { supabase, orgId } = await orgScopedClient();
  const area = String(formData.get("area") ?? "").trim();
  if (!area) return;
  await supabase.from("service_areas").insert({ org_id: orgId, area });
  revalidatePath("/knowledge");
}

export async function deleteServiceArea(formData: FormData): Promise<void> {
  const { supabase, orgId } = await orgScopedClient();
  await supabase.from("service_areas").delete().eq("id", String(formData.get("id"))).eq("org_id", orgId);
  revalidatePath("/knowledge");
}

export async function addFaq(formData: FormData): Promise<void> {
  const { supabase, orgId } = await orgScopedClient();
  const question = String(formData.get("question") ?? "").trim();
  const answer = String(formData.get("answer") ?? "").trim();
  if (!question || !answer) return;
  await supabase.from("faqs").insert({ org_id: orgId, question, answer });
  revalidatePath("/knowledge");
}

export async function deleteFaq(formData: FormData): Promise<void> {
  const { supabase, orgId } = await orgScopedClient();
  await supabase.from("faqs").delete().eq("id", String(formData.get("id"))).eq("org_id", orgId);
  revalidatePath("/knowledge");
}

export async function addPricingRule(formData: FormData): Promise<void> {
  const { supabase, orgId } = await orgScopedClient();
  const rule = String(formData.get("rule") ?? "").trim();
  if (!rule) return;
  await supabase.from("pricing_rules").insert({ org_id: orgId, rule });
  revalidatePath("/knowledge");
}

export async function deletePricingRule(formData: FormData): Promise<void> {
  const { supabase, orgId } = await orgScopedClient();
  await supabase.from("pricing_rules").delete().eq("id", String(formData.get("id"))).eq("org_id", orgId);
  revalidatePath("/knowledge");
}

export async function addQualificationQuestion(formData: FormData): Promise<void> {
  const { supabase, orgId } = await orgScopedClient();
  const question = String(formData.get("question") ?? "").trim();
  if (!question) return;
  const { count } = await supabase
    .from("qualification_questions")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);
  await supabase
    .from("qualification_questions")
    .insert({ org_id: orgId, question, sort_order: count ?? 0 });
  revalidatePath("/knowledge");
}

export async function deleteQualificationQuestion(formData: FormData): Promise<void> {
  const { supabase, orgId } = await orgScopedClient();
  await supabase
    .from("qualification_questions")
    .delete()
    .eq("id", String(formData.get("id")))
    .eq("org_id", orgId);
  revalidatePath("/knowledge");
}
