import { requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { updateAutomationMode, updateFollowupSettings } from "@/lib/actions/automation";
import { Card, Input, Label, PrimaryButton } from "@/components/ui";

const MODES = [
  {
    key: "draft",
    title: "Draft",
    description: "Claude prepares every response. A human always approves before it sends.",
  },
  {
    key: "safe_autopilot",
    title: "Safe Autopilot",
    description: "Routine responses send automatically. Anything uncertain still waits for your approval.",
  },
  {
    key: "autopilot",
    title: "Autopilot",
    description:
      "Claude handles normal qualification and follow-up automatically within your configured rules. Complaints, refunds, low-confidence cases, and anything outside your rules still always escalate to a human.",
  },
] as const;

export default async function AutomationPage() {
  const { org } = await requireOrg();
  const supabase = createClient();
  const { data: settings } = await supabase.from("followup_settings").select("*").eq("org_id", org.id).maybeSingle();

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Automation</h1>
        <p className="mt-1 text-sm text-slate-500">Control how much Claude does on its own.</p>
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-900">Automation mode</h2>
        <form action={updateAutomationMode} className="mt-4 space-y-3">
          {MODES.map((mode) => (
            <label
              key={mode.key}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${
                org.automation_mode === mode.key ? "border-brand-500 bg-brand-50" : "border-slate-200"
              }`}
            >
              <input
                type="radio"
                name="mode"
                value={mode.key}
                defaultChecked={org.automation_mode === mode.key}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-900">{mode.title}</span>
                <span className="block text-sm text-slate-500">{mode.description}</span>
              </span>
            </label>
          ))}
          <PrimaryButton type="submit">Save automation mode</PrimaryButton>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-900">Follow-up schedule</h2>
        <p className="mt-1 text-sm text-slate-500">
          Applies in your business timezone ({org.timezone}). Follow-ups never send after opt-out, Won, Lost, or
          human takeover.
        </p>
        <form action={updateFollowupSettings} className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="firstDelayHours">First follow-up delay (hours)</Label>
            <Input
              id="firstDelayHours"
              name="firstDelayHours"
              type="number"
              min={1}
              defaultValue={settings?.first_delay_hours ?? 24}
            />
          </div>
          <div>
            <Label htmlFor="secondDelayHours">Subsequent follow-up delay (hours)</Label>
            <Input
              id="secondDelayHours"
              name="secondDelayHours"
              type="number"
              min={1}
              defaultValue={settings?.second_delay_hours ?? 72}
            />
          </div>
          <div>
            <Label htmlFor="maxFollowups">Maximum follow-ups</Label>
            <Input id="maxFollowups" name="maxFollowups" type="number" min={0} max={10} defaultValue={settings?.max_followups ?? 2} />
          </div>
          <div />
          <div>
            <Label htmlFor="allowedStartHour">Allowed hours start (0–23, local)</Label>
            <Input
              id="allowedStartHour"
              name="allowedStartHour"
              type="number"
              min={0}
              max={23}
              defaultValue={settings?.allowed_start_hour ?? 9}
            />
          </div>
          <div>
            <Label htmlFor="allowedEndHour">Allowed hours end (0–23, local)</Label>
            <Input
              id="allowedEndHour"
              name="allowedEndHour"
              type="number"
              min={1}
              max={24}
              defaultValue={settings?.allowed_end_hour ?? 18}
            />
          </div>
          <PrimaryButton type="submit" className="col-span-2">
            Save follow-up settings
          </PrimaryButton>
        </form>
      </Card>
    </div>
  );
}
