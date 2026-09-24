"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const OnboardingSchema = z.object({
  name: z.string().min(1).max(200),
  industry: z.string().min(1).max(100),
  country: z.string().min(1).max(100),
  timezone: z.string().min(1).max(100),
  currency: z.string().min(3).max(10),
  languages: z.array(z.string().min(1)).min(1),
  website: z.string().max(300).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  services: z
    .array(z.object({ name: z.string().min(1).max(200), description: z.string().max(500).optional() }))
    .max(50),
  serviceAreas: z.array(z.string().min(1).max(200)).max(50),
  businessHoursStart: z.string().min(1),
  businessHoursEnd: z.string().min(1),
  faqs: z.array(z.object({ question: z.string().min(1).max(500), answer: z.string().min(1).max(2000) })).max(50),
  pricingRules: z.array(z.string().min(1).max(500)).max(50),
  qualificationQuestions: z.array(z.string().min(1).max(300)).max(30),
  bookingUrl: z.string().max(300).optional().nullable(),
  contactEmail: z.string().email().max(200),
  contactPhone: z.string().max(50).optional().nullable(),
  brandTone: z.string().max(500).optional().nullable(),
  aiInstructions: z.string().max(3000).optional().nullable(),
});

export type OnboardingInput = z.infer<typeof OnboardingSchema>;

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "business"}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function completeOnboarding(input: OnboardingInput): Promise<{ error?: string }> {
  const parsed = OnboardingSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid onboarding data." };
  }
  const data = parsed.data;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({
      slug: slugify(data.name),
      name: data.name,
      industry: data.industry,
      country: data.country,
      timezone: data.timezone,
      currency: data.currency.toUpperCase(),
      languages: data.languages,
      website: data.website || null,
      description: data.description || null,
      business_hours: { default: { open: data.businessHoursStart, close: data.businessHoursEnd } },
      booking_url: data.bookingUrl || null,
      contact_email: data.contactEmail,
      contact_phone: data.contactPhone || null,
      brand_tone: data.brandTone || null,
      ai_instructions: data.aiInstructions || null,
      onboarding_completed: true,
    })
    .select("id")
    .single();

  if (orgError || !org) return { error: orgError?.message ?? "Could not create organization." };

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ org_id: org.id, role: "owner" })
    .eq("id", user.id);
  if (profileError) return { error: profileError.message };

  if (data.services.length > 0) {
    await supabase
      .from("services")
      .insert(data.services.map((s) => ({ org_id: org.id, name: s.name, description: s.description || null })));
  }
  if (data.serviceAreas.length > 0) {
    await supabase.from("service_areas").insert(data.serviceAreas.map((area) => ({ org_id: org.id, area })));
  }
  if (data.faqs.length > 0) {
    await supabase
      .from("faqs")
      .insert(data.faqs.map((f) => ({ org_id: org.id, question: f.question, answer: f.answer })));
  }
  if (data.pricingRules.length > 0) {
    await supabase.from("pricing_rules").insert(data.pricingRules.map((rule) => ({ org_id: org.id, rule })));
  }
  if (data.qualificationQuestions.length > 0) {
    await supabase.from("qualification_questions").insert(
      data.qualificationQuestions.map((question, index) => ({
        org_id: org.id,
        question,
        sort_order: index,
      })),
    );
  }

  await supabase.from("followup_settings").insert({ org_id: org.id });

  await supabase.from("activity_log").insert({
    org_id: org.id,
    actor: user.email ?? "owner",
    action: "onboarding_completed",
    metadata: {},
  });

  redirect("/dashboard");
}
