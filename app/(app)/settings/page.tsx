import { requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { requestAccountDeletion, updatePlan } from "@/lib/actions/settings";
import { Card, Select, PrimaryButton, SecondaryButton, Badge } from "@/components/ui";

export default async function SettingsPage() {
  const { org, profile } = await requireOrg();
  const supabase = createClient();
  const { data: recentDeletionRequest } = await supabase
    .from("activity_log")
    .select("*")
    .eq("org_id", org.id)
    .eq("action", "deletion_requested")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Account, plan, and data controls.</p>
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-900">Account</h2>
        <p className="mt-2 text-sm text-slate-600">Signed in as {profile.email} ({profile.role})</p>
        <p className="text-sm text-slate-600">Workspace: {org.name}</p>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-900">Plan</h2>
        <p className="mt-1 text-sm text-slate-500">
          Current plan: <Badge tone="blue">{org.plan}</Badge>
        </p>
        <p className="mt-2 text-xs text-slate-400">
          Payment processing is not yet enabled on this MVP. Changing plans here updates your account's plan label
          only — no card is charged. Stripe integration is architected but intentionally not wired up yet.
        </p>
        <form action={updatePlan} className="mt-4 flex items-center gap-2">
          <Select name="plan" defaultValue={org.plan} className="w-48">
            <option value="starter">Starter</option>
            <option value="growth">Growth</option>
            <option value="pro">Pro</option>
            <option value="agency">Agency</option>
          </Select>
          <PrimaryButton type="submit">Update plan</PrimaryButton>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-900">Privacy &amp; data</h2>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-sm font-medium text-slate-800">Export your data</p>
            <p className="text-sm text-slate-500">Download all leads, conversations, and business knowledge as JSON.</p>
            <a href="/api/export" className="mt-2 inline-block">
              <SecondaryButton type="button">Export data</SecondaryButton>
            </a>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-800">Delete account &amp; data</p>
            <p className="text-sm text-slate-500">
              Requests permanent deletion of your workspace and all associated data. This is logged and processed by
              our team — it does not happen automatically from this button, since irreversible bulk deletion needs a
              confirmation step this MVP does not yet have.
            </p>
            {recentDeletionRequest ? (
              <p className="mt-2 text-sm text-amber-700">
                Deletion requested on {new Date(recentDeletionRequest.created_at).toLocaleString()}.
              </p>
            ) : (
              <form action={requestAccountDeletion} className="mt-2">
                <SecondaryButton type="submit" className="border-red-300 text-red-700 hover:bg-red-50">
                  Request account deletion
                </SecondaryButton>
              </form>
            )}
          </div>

          <div>
            <p className="text-sm font-medium text-slate-800">Opt-out handling</p>
            <p className="text-sm text-slate-500">
              A lead can be marked opted-out from its conversation in the Inbox — this immediately cancels any
              scheduled follow-ups and the AI will never message them again.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
