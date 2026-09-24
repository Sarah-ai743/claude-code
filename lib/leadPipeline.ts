import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, LeadStage } from "@/lib/supabase/database.types";
import { analyzeLead } from "@/lib/ai/analyzeLead";
import type { BusinessContext, ConversationTurn } from "@/lib/ai/prompt";
import type { LeadAnalysis } from "@/lib/ai/schema";
import { computeNextFollowUpTime } from "@/lib/followupPolicy";
import { DEFAULT_BUSINESS_HOURS } from "@/lib/businessTime";

type Client = SupabaseClient<Database>;

export interface IncomingLead {
  name: string;
  email: string;
  phone?: string | null;
  message: string;
  source?: string;
  idempotencyKey?: string | null;
}

function mapStage(analysis: LeadAnalysis, replySent: boolean): LeadStage {
  if (analysis.human_review_required || analysis.qualification_status === "human_required") {
    return "human_review";
  }
  if (analysis.qualification_status === "new" && replySent) return "contacted";
  return analysis.qualification_status;
}

async function loadBusinessContext(supabase: Client, orgId: string): Promise<BusinessContext> {
  const [{ data: org }, { data: services }, { data: areas }, { data: faqs }, { data: pricing }, { data: questions }] =
    await Promise.all([
      supabase.from("organizations").select("*").eq("id", orgId).single(),
      supabase.from("services").select("*").eq("org_id", orgId),
      supabase.from("service_areas").select("*").eq("org_id", orgId),
      supabase.from("faqs").select("*").eq("org_id", orgId),
      supabase.from("pricing_rules").select("*").eq("org_id", orgId),
      supabase.from("qualification_questions").select("*").eq("org_id", orgId).order("sort_order"),
    ]);

  if (!org) throw new Error("Organization not found");

  return {
    name: org.name,
    industry: org.industry,
    description: org.description,
    brandTone: org.brand_tone,
    aiInstructions: org.ai_instructions,
    services: (services ?? []).map((s) => ({ name: s.name, description: s.description, pricingNote: s.pricing_note })),
    serviceAreas: (areas ?? []).map((a) => a.area),
    faqs: (faqs ?? []).map((f) => ({ question: f.question, answer: f.answer })),
    pricingRules: (pricing ?? []).map((p) => p.rule),
    qualificationQuestions: (questions ?? []).map((q) => q.question),
    bookingUrl: org.booking_url,
    languages: org.languages,
    currency: org.currency,
    country: org.country,
  };
}

export interface CreateLeadResult {
  leadId: string;
  conversationId: string;
  deduplicated: boolean;
  analysis: LeadAnalysis;
  replySent: boolean;
}

/**
 * Full intake pipeline: store the lead, create the conversation, run AI
 * analysis, and — depending on the org's automation mode and the
 * analysis's own human_review_required flag — either send the reply or
 * queue it for approval. Never throws on AI failure (analyzeLead always
 * returns a safe fallback), so a lead is never lost even if Claude is down.
 */
export async function createLeadAndAnalyze(
  supabase: Client,
  orgId: string,
  input: IncomingLead,
): Promise<CreateLeadResult> {
  if (input.idempotencyKey) {
    const { data: existing } = await supabase
      .from("leads")
      .select("id")
      .eq("org_id", orgId)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (existing) {
      const { data: conversation } = await supabase
        .from("conversations")
        .select("id")
        .eq("lead_id", existing.id)
        .single();
      const { data: analysisLead } = await supabase
        .from("leads")
        .select("*")
        .eq("id", existing.id)
        .single();
      return {
        leadId: existing.id,
        conversationId: conversation?.id ?? "",
        deduplicated: true,
        replySent: false,
        analysis: {
          language: analysisLead?.language ?? "en",
          intent: analysisLead?.intent ?? "",
          requested_service: analysisLead?.requested_service ?? null,
          urgency: (analysisLead?.urgency as LeadAnalysis["urgency"]) ?? "medium",
          qualification_status: (analysisLead?.qualification_status as LeadAnalysis["qualification_status"]) ?? "new",
          missing_information: [],
          sentiment: (analysisLead?.sentiment as LeadAnalysis["sentiment"]) ?? "neutral",
          recommended_action: "no_action",
          reply: "",
          human_review_required: false,
          human_review_reason: null,
        },
      };
    }
  }

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .insert({
      org_id: orgId,
      name: input.name,
      email: input.email,
      phone: input.phone || null,
      source: input.source ?? "public_form",
      idempotency_key: input.idempotencyKey || null,
    })
    .select("*")
    .single();
  if (leadError || !lead) throw new Error(leadError?.message ?? "Failed to create lead");

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .insert({ org_id: orgId, lead_id: lead.id })
    .select("id")
    .single();
  if (convError || !conversation) throw new Error(convError?.message ?? "Failed to create conversation");

  await supabase.from("messages").insert({
    org_id: orgId,
    conversation_id: conversation.id,
    sender: "customer",
    content: input.message,
  });

  await supabase.from("activity_log").insert({
    org_id: orgId,
    lead_id: lead.id,
    actor: "system",
    action: "lead_received",
    metadata: { source: input.source ?? "public_form" },
  });

  const business = await loadBusinessContext(supabase, orgId);
  const history: ConversationTurn[] = [];

  const result = await analyzeLead({
    customerMessage: input.message,
    customerName: input.name,
    history,
    business,
  });
  const analysis = result.analysis;

  const { data: org } = await supabase.from("organizations").select("automation_mode").eq("id", orgId).single();
  const mode = org?.automation_mode ?? "draft";

  const isRoutine =
    !analysis.human_review_required &&
    ["reply", "ask_question", "send_booking_link"].includes(analysis.recommended_action);
  const autoSend = mode === "autopilot" ? !analysis.human_review_required : mode === "safe_autopilot" ? isRoutine : false;

  const { data: aiMessage } = await supabase
    .from("messages")
    .insert({
      org_id: orgId,
      conversation_id: conversation.id,
      sender: "ai",
      content: analysis.reply,
      language: analysis.language,
      pending_approval: !autoSend,
    })
    .select("id")
    .single();

  if (!autoSend && aiMessage) {
    await supabase.from("approvals").insert({
      org_id: orgId,
      lead_id: lead.id,
      conversation_id: conversation.id,
      message_id: aiMessage.id,
      draft_content: analysis.reply,
    });
  }

  const stage = mapStage(analysis, autoSend);

  await supabase
    .from("leads")
    .update({
      stage,
      qualification_status: analysis.qualification_status,
      language: analysis.language,
      intent: analysis.intent,
      requested_service: analysis.requested_service,
      urgency: analysis.urgency,
      sentiment: analysis.sentiment,
      updated_at: new Date().toISOString(),
    })
    .eq("id", lead.id);

  await supabase.from("activity_log").insert({
    org_id: orgId,
    lead_id: lead.id,
    actor: "ai",
    action: autoSend ? "ai_replied" : "ai_draft_created",
    metadata: {
      usedFallback: result.usedFallback,
      recommended_action: analysis.recommended_action,
      model: result.model,
      latencyMs: result.latencyMs,
    },
  });

  if (autoSend && stage !== "human_review" && stage !== "won" && stage !== "lost") {
    await scheduleFirstFollowUp(supabase, orgId, lead.id);
  }

  return { leadId: lead.id, conversationId: conversation.id, deduplicated: false, analysis, replySent: autoSend };
}

export async function cancelFollowUpsForLead(
  supabase: Client,
  orgId: string,
  leadId: string,
  reason: string,
): Promise<void> {
  await supabase
    .from("followup_jobs")
    .update({ status: "cancelled", cancel_reason: reason })
    .eq("org_id", orgId)
    .eq("lead_id", leadId)
    .eq("status", "scheduled");
}

export async function scheduleFirstFollowUp(supabase: Client, orgId: string, leadId: string): Promise<void> {
  const [{ data: org }, { data: settings }] = await Promise.all([
    supabase.from("organizations").select("timezone").eq("id", orgId).single(),
    supabase.from("followup_settings").select("*").eq("org_id", orgId).maybeSingle(),
  ]);

  const firstDelay = settings?.first_delay_hours ?? 24;
  const runAt = computeNextFollowUpTime({
    now: new Date(),
    delayHours: firstDelay,
    timeZone: org?.timezone ?? "UTC",
    businessHours: {
      ...DEFAULT_BUSINESS_HOURS,
      startHour: settings?.allowed_start_hour ?? DEFAULT_BUSINESS_HOURS.startHour,
      endHour: settings?.allowed_end_hour ?? DEFAULT_BUSINESS_HOURS.endHour,
    },
  });

  await supabase.from("followup_jobs").insert({
    org_id: orgId,
    lead_id: leadId,
    attempt_number: 1,
    run_at: runAt.toISOString(),
  });
}
