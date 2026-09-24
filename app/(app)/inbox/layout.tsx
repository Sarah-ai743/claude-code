import Link from "next/link";
import { requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui";

const STAGE_TONE: Record<string, "slate" | "green" | "amber" | "red" | "blue" | "violet"> = {
  new: "blue",
  contacted: "slate",
  needs_information: "amber",
  qualified: "violet",
  quote_requested: "violet",
  booking_ready: "green",
  won: "green",
  lost: "red",
  human_review: "red",
};

export default async function InboxLayout({ children }: { children: React.ReactNode }) {
  const { org } = await requireOrg();
  const supabase = createClient();
  const { data: leads } = await supabase
    .from("leads")
    .select("id, name, stage, urgency, created_at, updated_at")
    .eq("org_id", org.id)
    .order("updated_at", { ascending: false })
    .limit(100);

  return (
    <div className="flex h-[calc(100vh-0px)] md:h-screen">
      <aside className="w-full max-w-xs shrink-0 overflow-y-auto border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h1 className="font-semibold text-slate-900">Inbox</h1>
          <p className="text-xs text-slate-500">{leads?.length ?? 0} conversations</p>
        </div>
        <ul>
          {(leads ?? []).map((lead) => (
            <li key={lead.id} className="border-b border-slate-100">
              <Link href={`/inbox/${lead.id}`} className="block px-4 py-3 hover:bg-slate-50">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-800">{lead.name}</span>
                  {lead.urgency === "high" && <Badge tone="red">urgent</Badge>}
                </div>
                <div className="mt-1">
                  <Badge tone={STAGE_TONE[lead.stage] ?? "slate"}>{lead.stage.replace("_", " ")}</Badge>
                </div>
              </Link>
            </li>
          ))}
          {(leads ?? []).length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-slate-400">No leads yet.</li>
          )}
        </ul>
      </aside>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
