import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import {
  moveLeadStage,
  takeoverConversation,
  sendHumanMessage,
  approveDraft,
  editAndApproveDraft,
  rejectDraft,
  toggleOptOut,
} from "@/lib/actions/leads";
import { Badge, Select, Textarea, PrimaryButton, SecondaryButton, Card } from "@/components/ui";
import type { LeadStage } from "@/lib/supabase/database.types";

const STAGES: LeadStage[] = [
  "new",
  "contacted",
  "needs_information",
  "qualified",
  "quote_requested",
  "booking_ready",
  "won",
  "lost",
  "human_review",
];

export default async function LeadConversationPage({ params }: { params: { leadId: string } }) {
  const { org } = await requireOrg();
  const supabase = createClient();

  const { data: lead } = await supabase.from("leads").select("*").eq("id", params.leadId).eq("org_id", org.id).single();
  if (!lead) notFound();

  const { data: conversation } = await supabase
    .from("conversations")
    .select("*")
    .eq("lead_id", lead.id)
    .single();

  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversation?.id ?? "")
    .order("created_at");

  const { data: pendingApprovals } = await supabase
    .from("approvals")
    .select("*")
    .eq("lead_id", lead.id)
    .eq("status", "pending");

  const approvalByMessage = new Map((pendingApprovals ?? []).map((a) => [a.message_id, a]));

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{lead.name}</h2>
            <p className="text-sm text-slate-500">
              {lead.email} {lead.phone ? `· ${lead.phone}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {lead.language && <Badge tone="blue">{lead.language}</Badge>}
            {lead.urgency && <Badge tone={lead.urgency === "high" ? "red" : lead.urgency === "medium" ? "amber" : "slate"}>{lead.urgency} urgency</Badge>}
            {lead.sentiment && <Badge tone="violet">{lead.sentiment}</Badge>}
            {lead.opted_out && <Badge tone="red">opted out</Badge>}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <form action={moveLeadStage} className="flex items-center gap-2">
            <input type="hidden" name="leadId" value={lead.id} />
            <Select name="stage" defaultValue={lead.stage} className="w-48">
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </Select>
            <SecondaryButton type="submit" className="px-3 py-1.5 text-xs">
              Update stage
            </SecondaryButton>
          </form>

          <form action={takeoverConversation}>
            <input type="hidden" name="leadId" value={lead.id} />
            <SecondaryButton type="submit" className="px-3 py-1.5 text-xs">
              {conversation?.status === "human_takeover" ? "Takeover active" : "Take over conversation"}
            </SecondaryButton>
          </form>

          <form action={toggleOptOut}>
            <input type="hidden" name="leadId" value={lead.id} />
            <input type="hidden" name="optedOut" value={(!lead.opted_out).toString()} />
            <SecondaryButton type="submit" className="px-3 py-1.5 text-xs">
              {lead.opted_out ? "Clear opt-out" : "Mark opted out"}
            </SecondaryButton>
          </form>
        </div>
        {lead.requested_service && (
          <p className="mt-2 text-xs text-slate-500">
            Requested: <span className="font-medium text-slate-700">{lead.requested_service}</span> · Intent: {lead.intent}
          </p>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
        {(messages ?? []).map((message) => (
          <div key={message.id} className={`flex ${message.sender === "customer" ? "justify-start" : "justify-end"}`}>
            <div
              className={`max-w-lg rounded-xl px-4 py-3 text-sm shadow-sm ${
                message.sender === "customer"
                  ? "bg-white text-slate-800"
                  : message.sender === "human"
                    ? "bg-brand-600 text-white"
                    : message.pending_approval
                      ? "bg-amber-50 text-slate-800 ring-1 ring-amber-300"
                      : "bg-brand-100 text-slate-800"
              }`}
            >
              <p className="mb-1 text-[10px] uppercase tracking-wide opacity-60">
                {message.sender} · {new Date(message.created_at).toLocaleString()}
                {message.pending_approval ? " · pending approval" : ""}
              </p>
              <p className="whitespace-pre-wrap">{message.content}</p>

              {message.pending_approval && approvalByMessage.has(message.id) && (
                <div className="mt-3 space-y-2 border-t border-amber-300 pt-2">
                  <form action={approveDraft} className="inline">
                    <input type="hidden" name="approvalId" value={approvalByMessage.get(message.id)!.id} />
                    <input type="hidden" name="leadId" value={lead.id} />
                    <input type="hidden" name="messageId" value={message.id} />
                    <button type="submit" className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white">
                      Approve &amp; send
                    </button>
                  </form>{" "}
                  <form action={rejectDraft} className="inline">
                    <input type="hidden" name="approvalId" value={approvalByMessage.get(message.id)!.id} />
                    <input type="hidden" name="leadId" value={lead.id} />
                    <input type="hidden" name="messageId" value={message.id} />
                    <button type="submit" className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                      Reject
                    </button>
                  </form>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-slate-500">Edit before sending</summary>
                    <form action={editAndApproveDraft} className="mt-2 space-y-2">
                      <input type="hidden" name="approvalId" value={approvalByMessage.get(message.id)!.id} />
                      <input type="hidden" name="leadId" value={lead.id} />
                      <input type="hidden" name="messageId" value={message.id} />
                      <Textarea name="content" defaultValue={message.content} rows={3} className="text-slate-900" />
                      <button type="submit" className="rounded bg-brand-600 px-2 py-1 text-xs font-semibold text-white">
                        Save &amp; send
                      </button>
                    </form>
                  </details>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <Card className="mx-6 mb-6 p-4">
        <form action={sendHumanMessage} className="flex gap-2">
          <input type="hidden" name="leadId" value={lead.id} />
          <Textarea name="content" rows={2} placeholder="Reply as yourself…" className="flex-1" />
          <PrimaryButton type="submit" className="h-fit self-end">
            Send
          </PrimaryButton>
        </form>
      </Card>
    </div>
  );
}
