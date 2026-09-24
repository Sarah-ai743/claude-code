import { requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { Card, Badge } from "@/components/ui";

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </Card>
  );
}

export default async function DashboardPage() {
  const { org } = await requireOrg();
  const supabase = createClient();

  const { data: leads } = await supabase
    .from("leads")
    .select("id, stage, source, created_at")
    .eq("org_id", org.id);

  const allLeads = leads ?? [];
  const countByStage = (stage: string) => allLeads.filter((l) => l.stage === stage).length;

  const { count: pendingApprovals } = await supabase
    .from("approvals")
    .select("id", { count: "exact", head: true })
    .eq("org_id", org.id)
    .eq("status", "pending");

  const totalLeads = allLeads.length;
  const wonCount = countByStage("won");
  const conversionRate = totalLeads > 0 ? ((wonCount / totalLeads) * 100).toFixed(1) : "0.0";

  const sourceCounts = new Map<string, number>();
  for (const lead of allLeads) {
    sourceCounts.set(lead.source, (sourceCounts.get(lead.source) ?? 0) + 1);
  }

  // Average response time: first non-customer message minus lead creation,
  // across the most recent 200 leads that have at least one reply.
  const { data: recentLeads } = await supabase
    .from("leads")
    .select("id, created_at")
    .eq("org_id", org.id)
    .order("created_at", { ascending: false })
    .limit(200);

  let avgResponseMs: number | null = null;
  if (recentLeads && recentLeads.length > 0) {
    const leadIds = recentLeads.map((l) => l.id);
    const { data: conversations } = await supabase
      .from("conversations")
      .select("id, lead_id")
      .in("lead_id", leadIds);
    const conversationIds = (conversations ?? []).map((c) => c.id);
    const { data: firstReplies } = conversationIds.length
      ? await supabase
          .from("messages")
          .select("conversation_id, sender, created_at")
          .in("conversation_id", conversationIds)
          .in("sender", ["ai", "human"])
          .order("created_at", { ascending: true })
      : { data: [] };

    const firstReplyByConversation = new Map<string, string>();
    for (const message of firstReplies ?? []) {
      if (!firstReplyByConversation.has(message.conversation_id)) {
        firstReplyByConversation.set(message.conversation_id, message.created_at);
      }
    }
    const leadCreatedById = new Map(recentLeads.map((l) => [l.id, l.created_at]));
    const conversationToLead = new Map((conversations ?? []).map((c) => [c.id, c.lead_id]));

    const diffs: number[] = [];
    for (const [conversationId, replyAt] of firstReplyByConversation) {
      const leadId = conversationToLead.get(conversationId);
      const createdAt = leadId ? leadCreatedById.get(leadId) : undefined;
      if (createdAt) diffs.push(new Date(replyAt).getTime() - new Date(createdAt).getTime());
    }
    if (diffs.length > 0) avgResponseMs = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  }

  const { data: recentActivity } = await supabase
    .from("activity_log")
    .select("*")
    .eq("org_id", org.id)
    .order("created_at", { ascending: false })
    .limit(15);

  const { data: leadNamesRaw } = await supabase.from("leads").select("id, name").eq("org_id", org.id);
  const leadNames = new Map((leadNamesRaw ?? []).map((l) => [l.id, l.name]));

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Live numbers from your account — nothing here is simulated.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="New leads" value={countByStage("new")} />
        <StatCard label="Qualified" value={countByStage("qualified")} />
        <StatCard label="Needs attention" value={(pendingApprovals ?? 0) + countByStage("human_review")} />
        <StatCard label="Booking-ready" value={countByStage("booking_ready")} />
        <StatCard label="Won" value={wonCount} />
        <StatCard label="Conversion rate" value={`${conversionRate}%`} sub={`${wonCount} of ${totalLeads} leads`} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-700">Average first response time</h2>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {avgResponseMs === null
              ? "No replies yet"
              : avgResponseMs < 60 * 60 * 1000
                ? `${Math.round(avgResponseMs / 60000)} min`
                : `${(avgResponseMs / (60 * 60 * 1000)).toFixed(1)} hrs`}
          </p>
          <p className="mt-1 text-xs text-slate-400">Time from lead creation to first AI or human reply.</p>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-700">Lead sources</h2>
          <ul className="mt-2 space-y-1">
            {[...sourceCounts.entries()].map(([source, count]) => (
              <li key={source} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{source}</span>
                <span className="font-medium text-slate-900">{count}</span>
              </li>
            ))}
            {sourceCounts.size === 0 && <li className="text-sm text-slate-400">No leads yet.</li>}
          </ul>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-slate-700">Recent activity</h2>
        <ul className="mt-3 divide-y divide-slate-100">
          {(recentActivity ?? []).map((entry) => (
            <li key={entry.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-slate-600">
                <Badge tone="slate">{entry.actor}</Badge>{" "}
                {entry.action.replace(/_/g, " ")}
                {entry.lead_id && leadNames.get(entry.lead_id) ? ` — ${leadNames.get(entry.lead_id)}` : ""}
              </span>
              <span className="text-xs text-slate-400">{new Date(entry.created_at).toLocaleString()}</span>
            </li>
          ))}
          {(recentActivity ?? []).length === 0 && <li className="py-2 text-sm text-slate-400">No activity yet.</li>}
        </ul>
      </Card>
    </div>
  );
}
