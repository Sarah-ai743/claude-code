"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import type { LeadStage } from "@/lib/supabase/database.types";
import { scheduleFirstFollowUp, cancelFollowUpsForLead } from "@/lib/leadPipeline";

async function ctx() {
  const { org, profile } = await requireOrg();
  const supabase = createClient();
  return { supabase, orgId: org.id, actor: profile.email };
}

const TERMINAL_STAGES: LeadStage[] = ["won", "lost", "human_review"];

export async function moveLeadStage(formData: FormData): Promise<void> {
  const { supabase, orgId, actor } = await ctx();
  const leadId = String(formData.get("leadId"));
  const stage = String(formData.get("stage")) as LeadStage;

  await supabase.from("leads").update({ stage, updated_at: new Date().toISOString() }).eq("id", leadId).eq("org_id", orgId);

  if (TERMINAL_STAGES.includes(stage)) {
    await cancelFollowUpsForLead(supabase, orgId, leadId, `Lead moved to ${stage}`);
  }

  await supabase.from("activity_log").insert({
    org_id: orgId,
    lead_id: leadId,
    actor,
    action: "stage_changed",
    metadata: { stage },
  });

  revalidatePath("/leads");
  revalidatePath(`/inbox/${leadId}`);
}

export async function takeoverConversation(formData: FormData): Promise<void> {
  const { supabase, orgId, actor } = await ctx();
  const leadId = String(formData.get("leadId"));
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("lead_id", leadId)
    .eq("org_id", orgId)
    .single();
  if (!conversation) return;

  await supabase.from("conversations").update({ status: "human_takeover" }).eq("id", conversation.id).eq("org_id", orgId);
  await cancelFollowUpsForLead(supabase, orgId, leadId, "Human took over the conversation");
  await supabase.from("activity_log").insert({
    org_id: orgId,
    lead_id: leadId,
    actor,
    action: "human_takeover",
    metadata: {},
  });
  revalidatePath(`/inbox/${leadId}`);
}

export async function sendHumanMessage(formData: FormData): Promise<void> {
  const { supabase, orgId, actor } = await ctx();
  const leadId = String(formData.get("leadId"));
  const content = String(formData.get("content") ?? "").trim();
  if (!content) return;

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("lead_id", leadId)
    .eq("org_id", orgId)
    .single();
  if (!conversation) return;

  await supabase.from("messages").insert({
    org_id: orgId,
    conversation_id: conversation.id,
    sender: "human",
    content,
  });

  await supabase.from("activity_log").insert({
    org_id: orgId,
    lead_id: leadId,
    actor,
    action: "human_replied",
    metadata: {},
  });

  revalidatePath(`/inbox/${leadId}`);
}

export async function approveDraft(formData: FormData): Promise<void> {
  const { supabase, orgId, actor } = await ctx();
  const approvalId = String(formData.get("approvalId"));
  const leadId = String(formData.get("leadId"));
  const messageId = String(formData.get("messageId"));

  await supabase.from("messages").update({ pending_approval: false }).eq("id", messageId).eq("org_id", orgId);
  await supabase
    .from("approvals")
    .update({ status: "approved", resolved_at: new Date().toISOString() })
    .eq("id", approvalId)
    .eq("org_id", orgId);

  await supabase.from("activity_log").insert({
    org_id: orgId,
    lead_id: leadId,
    actor,
    action: "draft_approved",
    metadata: { approvalId },
  });

  const { data: lead } = await supabase.from("leads").select("stage").eq("id", leadId).single();
  if (lead && !TERMINAL_STAGES.includes(lead.stage)) {
    await scheduleFirstFollowUp(supabase, orgId, leadId);
  }

  revalidatePath(`/inbox/${leadId}`);
}

export async function editAndApproveDraft(formData: FormData): Promise<void> {
  const { supabase, orgId, actor } = await ctx();
  const approvalId = String(formData.get("approvalId"));
  const leadId = String(formData.get("leadId"));
  const messageId = String(formData.get("messageId"));
  const content = String(formData.get("content") ?? "").trim();
  if (!content) return;

  await supabase.from("messages").update({ content, pending_approval: false }).eq("id", messageId).eq("org_id", orgId);
  await supabase
    .from("approvals")
    .update({ status: "edited", draft_content: content, resolved_at: new Date().toISOString() })
    .eq("id", approvalId)
    .eq("org_id", orgId);

  await supabase.from("activity_log").insert({
    org_id: orgId,
    lead_id: leadId,
    actor,
    action: "draft_edited_and_approved",
    metadata: { approvalId },
  });

  revalidatePath(`/inbox/${leadId}`);
}

export async function rejectDraft(formData: FormData): Promise<void> {
  const { supabase, orgId, actor } = await ctx();
  const approvalId = String(formData.get("approvalId"));
  const leadId = String(formData.get("leadId"));
  const messageId = String(formData.get("messageId"));

  await supabase.from("messages").delete().eq("id", messageId).eq("org_id", orgId);
  await supabase
    .from("approvals")
    .update({ status: "rejected", resolved_at: new Date().toISOString() })
    .eq("id", approvalId)
    .eq("org_id", orgId);

  await supabase.from("activity_log").insert({
    org_id: orgId,
    lead_id: leadId,
    actor,
    action: "draft_rejected",
    metadata: { approvalId },
  });

  revalidatePath(`/inbox/${leadId}`);
}

export async function toggleOptOut(formData: FormData): Promise<void> {
  const { supabase, orgId, actor } = await ctx();
  const leadId = String(formData.get("leadId"));
  const optedOut = String(formData.get("optedOut")) === "true";

  await supabase.from("leads").update({ opted_out: optedOut }).eq("id", leadId).eq("org_id", orgId);

  if (optedOut) {
    await cancelFollowUpsForLead(supabase, orgId, leadId, "Customer opted out");
  }

  await supabase.from("activity_log").insert({
    org_id: orgId,
    lead_id: leadId,
    actor,
    action: optedOut ? "customer_opted_out" : "opt_out_cleared",
    metadata: {},
  });

  revalidatePath(`/inbox/${leadId}`);
}
