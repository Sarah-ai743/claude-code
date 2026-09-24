import Link from "next/link";
import { requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { moveLeadStage } from "@/lib/actions/leads";
import { Card } from "@/components/ui";
import { StageSelect } from "./StageSelect";
import type { LeadStage } from "@/lib/supabase/database.types";

const STAGES: { key: LeadStage; label: string }[] = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "needs_information", label: "Needs Information" },
  { key: "qualified", label: "Qualified" },
  { key: "quote_requested", label: "Quote Requested" },
  { key: "booking_ready", label: "Booking Ready" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
  { key: "human_review", label: "Human Review" },
];

export default async function PipelinePage() {
  const { org } = await requireOrg();
  const supabase = createClient();
  const { data: leads } = await supabase
    .from("leads")
    .select("*")
    .eq("org_id", org.id)
    .order("updated_at", { ascending: false });

  const byStage = new Map<LeadStage, typeof leads>();
  for (const stage of STAGES) byStage.set(stage.key, []);
  for (const lead of leads ?? []) {
    byStage.get(lead.stage)?.push(lead);
  }

  return (
    <div className="px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900">Pipeline</h1>
      <p className="mt-1 text-sm text-slate-500">Move leads through stages manually, or let AI move them.</p>

      <div className="mt-6 flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => (
          <div key={stage.key} className="w-72 shrink-0">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">{stage.label}</h2>
              <span className="text-xs text-slate-400">{byStage.get(stage.key)?.length ?? 0}</span>
            </div>
            <div className="space-y-2">
              {(byStage.get(stage.key) ?? []).map((lead) => (
                <Card key={lead.id} className="p-3">
                  <Link href={`/inbox/${lead.id}`} className="text-sm font-medium text-slate-800 hover:underline">
                    {lead.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-slate-500">{lead.requested_service ?? lead.intent ?? "—"}</p>
                  <form action={moveLeadStage} className="mt-2">
                    <input type="hidden" name="leadId" value={lead.id} />
                    <StageSelect stages={STAGES} defaultValue={lead.stage} />
                  </form>
                </Card>
              ))}
              {(byStage.get(stage.key) ?? []).length === 0 && (
                <p className="text-xs text-slate-300">No leads</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
