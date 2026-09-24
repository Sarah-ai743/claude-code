import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { checkFollowUpPolicy, computeNextFollowUpTime, type FollowUpMessage } from "@/lib/followupPolicy";
import { DEFAULT_BUSINESS_HOURS } from "@/lib/businessTime";
import { generateFollowUpMessage } from "@/lib/ai/followupMessage";
import type { BusinessContext, ConversationTurn } from "@/lib/ai/prompt";

export const runtime = "nodejs";
export const maxDuration = 60;

const URGENCY_QUIET_HOURS: Record<string, number> = { high: 24, medium: 72, low: 168 };

function authorized(request: Request): boolean {
  const auth = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-cron-secret");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  return bearer === env.CRON_SECRET || headerSecret === env.CRON_SECRET;
}

/**
 * Processes every due follow-up job. Invoked by Vercel Cron (see
 * vercel.json) on a schedule; safe to call more often than needed since
 * each job is only ever processed once (status transitions away from
 * `scheduled` inside this handler).
 */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();

  const { data: dueJobs, error } = await supabase
    .from("followup_jobs")
    .select("*")
    .eq("status", "scheduled")
    .lte("run_at", now.toISOString())
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Record<string, unknown>[] = [];

  for (const job of dueJobs ?? []) {
    try {
      const { data: lead } = await supabase.from("leads").select("*").eq("id", job.lead_id).single();
      if (!lead) {
        await supabase.from("followup_jobs").update({ status: "cancelled", cancel_reason: "Lead not found" }).eq("id", job.id);
        continue;
      }

      const [{ data: org }, { data: settings }, { data: conversation }] = await Promise.all([
        supabase.from("organizations").select("*").eq("id", job.org_id).single(),
        supabase.from("followup_settings").select("*").eq("org_id", job.org_id).maybeSingle(),
        supabase.from("conversations").select("*").eq("lead_id", lead.id).single(),
      ]);

      if (!org || !conversation) {
        await supabase.from("followup_jobs").update({ status: "cancelled", cancel_reason: "Org or conversation missing" }).eq("id", job.id);
        continue;
      }

      const { data: messages } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversation.id)
        .order("created_at");

      const policyMessages: FollowUpMessage[] = (messages ?? []).map((m) => ({
        sender: m.sender,
        content: m.content,
      }));
      const lastMessage = (messages ?? [])[(messages ?? []).length - 1];
      const maxFollowups = settings?.max_followups ?? 2;

      const block = checkFollowUpPolicy({
        messages: policyMessages,
        leadStage: lead.stage,
        optedOut: lead.opted_out,
        attemptNumber: job.attempt_number,
        maxFollowups,
        lastContactAt: lastMessage ? new Date(lastMessage.created_at) : new Date(job.created_at),
        now,
        minQuietHours: URGENCY_QUIET_HOURS[lead.urgency ?? "medium"] ?? 72,
        allowedStartHour: settings?.allowed_start_hour ?? DEFAULT_BUSINESS_HOURS.startHour,
        allowedEndHour: settings?.allowed_end_hour ?? DEFAULT_BUSINESS_HOURS.endHour,
        timeZone: org.timezone,
      });

      if (block) {
        await supabase
          .from("followup_jobs")
          .update({ status: "cancelled", cancel_reason: `${block.code}: ${block.reason}` })
          .eq("id", job.id);
        await supabase.from("activity_log").insert({
          org_id: job.org_id,
          lead_id: lead.id,
          actor: "system",
          action: "followup_blocked",
          metadata: { code: block.code, reason: block.reason },
        });
        results.push({ jobId: job.id, outcome: "blocked", code: block.code });
        continue;
      }

      const [{ data: services }, { data: areas }, { data: faqs }, { data: pricing }, { data: questions }] =
        await Promise.all([
          supabase.from("services").select("*").eq("org_id", job.org_id),
          supabase.from("service_areas").select("*").eq("org_id", job.org_id),
          supabase.from("faqs").select("*").eq("org_id", job.org_id),
          supabase.from("pricing_rules").select("*").eq("org_id", job.org_id),
          supabase.from("qualification_questions").select("*").eq("org_id", job.org_id).order("sort_order"),
        ]);

      const business: BusinessContext = {
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
      const history: ConversationTurn[] = (messages ?? []).map((m) => ({
        sender: m.sender,
        content: m.content,
        createdAt: m.created_at,
      }));

      const generated = await generateFollowUpMessage({
        business,
        history,
        leadLanguage: lead.language,
        missingInformation: [],
        attemptNumber: job.attempt_number,
      });

      const autoSend = org.automation_mode !== "draft";
      const { data: aiMessage } = await supabase
        .from("messages")
        .insert({
          org_id: job.org_id,
          conversation_id: conversation.id,
          sender: "ai",
          content: generated.message,
          language: lead.language,
          pending_approval: !autoSend,
        })
        .select("id")
        .single();

      if (!autoSend && aiMessage) {
        await supabase.from("approvals").insert({
          org_id: job.org_id,
          lead_id: lead.id,
          conversation_id: conversation.id,
          message_id: aiMessage.id,
          draft_content: generated.message,
        });
      }

      await supabase.from("followup_jobs").update({ status: "sent" }).eq("id", job.id);
      await supabase.from("activity_log").insert({
        org_id: job.org_id,
        lead_id: lead.id,
        actor: "system",
        action: "followup_sent",
        metadata: { attempt: job.attempt_number, autoSend, usedFallback: generated.usedFallback },
      });

      if (job.attempt_number < maxFollowups) {
        const delayHours = job.attempt_number === 1 ? settings?.second_delay_hours ?? 72 : settings?.second_delay_hours ?? 72;
        const runAt = computeNextFollowUpTime({
          now,
          delayHours,
          timeZone: org.timezone,
          businessHours: {
            ...DEFAULT_BUSINESS_HOURS,
            startHour: settings?.allowed_start_hour ?? DEFAULT_BUSINESS_HOURS.startHour,
            endHour: settings?.allowed_end_hour ?? DEFAULT_BUSINESS_HOURS.endHour,
          },
        });
        await supabase.from("followup_jobs").insert({
          org_id: job.org_id,
          lead_id: lead.id,
          attempt_number: job.attempt_number + 1,
          run_at: runAt.toISOString(),
        });
      }

      results.push({ jobId: job.id, outcome: "sent" });
    } catch (jobError) {
      // Never let one bad job crash the whole run; mark it failed and move on.
      await supabase
        .from("followup_jobs")
        .update({ status: "failed", cancel_reason: (jobError as Error).message })
        .eq("id", job.id);
      results.push({ jobId: job.id, outcome: "failed", error: (jobError as Error).message });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
