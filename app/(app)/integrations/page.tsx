import { requireOrg } from "@/lib/org";
import { Card, Badge } from "@/components/ui";

export default async function IntegrationsPage() {
  const { org } = await requireOrg();
  const publicUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/contact/${org.slug}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Integrations</h1>
        <p className="mt-1 text-sm text-slate-500">Your public lead form and API, plus what's coming next.</p>
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Public lead form</h2>
          <Badge tone="green">Live</Badge>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Share this link anywhere — every submission is analyzed by AI and appears in your Inbox automatically.
        </p>
        <code className="mt-2 block overflow-x-auto rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-800">
          {publicUrl}
        </code>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Lead intake API</h2>
          <Badge tone="green">Live</Badge>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          POST leads programmatically from your own website or another form tool.
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 px-3 py-3 text-xs text-slate-100">
{`POST /api/leads/public
Content-Type: application/json

{
  "slug": "${org.slug}",
  "name": "Jane Doe",
  "email": "jane@example.com",
  "phone": "+1 555 0100",
  "message": "I need a quote for a 3-bedroom deep clean"
}`}
        </pre>
      </Card>

      {[
        { name: "Calendar (Google Calendar)", note: "Sync booking-ready leads to your calendar." },
        { name: "CRM (HubSpot / Pipedrive)", note: "Push qualified leads to your existing CRM." },
        { name: "Outbound email / SMS", note: "Send AI replies and follow-ups via a real provider (Postmark/Twilio)." },
      ].map((item) => (
        <Card key={item.name} className="p-6">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">{item.name}</h2>
            <Badge tone="amber">Not yet connected</Badge>
          </div>
          <p className="mt-2 text-sm text-slate-600">{item.note}</p>
        </Card>
      ))}
    </div>
  );
}
