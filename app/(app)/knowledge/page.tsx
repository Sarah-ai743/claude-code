import { requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import {
  updateOrgProfile,
  addService,
  deleteService,
  addServiceArea,
  deleteServiceArea,
  addFaq,
  deleteFaq,
  addPricingRule,
  deletePricingRule,
  addQualificationQuestion,
  deleteQualificationQuestion,
} from "@/lib/actions/knowledge";
import { Card, Input, Label, Textarea, PrimaryButton, SecondaryButton } from "@/components/ui";

export default async function KnowledgePage() {
  const { org } = await requireOrg();
  const supabase = createClient();

  const [{ data: services }, { data: areas }, { data: faqs }, { data: pricingRules }, { data: questions }] =
    await Promise.all([
      supabase.from("services").select("*").eq("org_id", org.id).order("created_at"),
      supabase.from("service_areas").select("*").eq("org_id", org.id).order("created_at"),
      supabase.from("faqs").select("*").eq("org_id", org.id).order("created_at"),
      supabase.from("pricing_rules").select("*").eq("org_id", org.id).order("created_at"),
      supabase.from("qualification_questions").select("*").eq("org_id", org.id).order("sort_order"),
    ]);

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Business Knowledge</h1>
        <p className="mt-1 text-sm text-slate-500">
          The AI can only answer using what's here. Keep it accurate and up to date.
        </p>
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-900">Business profile</h2>
        <form action={updateOrgProfile} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" defaultValue={org.name} required />
            </div>
            <div>
              <Label htmlFor="industry">Industry</Label>
              <Input id="industry" name="industry" defaultValue={org.industry ?? ""} />
            </div>
            <div>
              <Label htmlFor="country">Country</Label>
              <Input id="country" name="country" defaultValue={org.country ?? ""} />
            </div>
            <div>
              <Label htmlFor="timezone">Timezone</Label>
              <Input id="timezone" name="timezone" defaultValue={org.timezone} />
            </div>
            <div>
              <Label htmlFor="currency">Currency</Label>
              <Input id="currency" name="currency" defaultValue={org.currency} />
            </div>
            <div>
              <Label htmlFor="languages">Languages (comma-separated)</Label>
              <Input id="languages" name="languages" defaultValue={org.languages.join(", ")} />
            </div>
            <div>
              <Label htmlFor="website">Website</Label>
              <Input id="website" name="website" defaultValue={org.website ?? ""} />
            </div>
            <div>
              <Label htmlFor="bookingUrl">Booking URL</Label>
              <Input id="bookingUrl" name="bookingUrl" defaultValue={org.booking_url ?? ""} />
            </div>
            <div>
              <Label htmlFor="contactEmail">Contact email</Label>
              <Input id="contactEmail" name="contactEmail" defaultValue={org.contact_email ?? ""} />
            </div>
            <div>
              <Label htmlFor="contactPhone">Contact phone</Label>
              <Input id="contactPhone" name="contactPhone" defaultValue={org.contact_phone ?? ""} />
            </div>
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" rows={3} defaultValue={org.description ?? ""} />
          </div>
          <div>
            <Label htmlFor="brandTone">Brand tone</Label>
            <Input id="brandTone" name="brandTone" defaultValue={org.brand_tone ?? ""} />
          </div>
          <div>
            <Label htmlFor="aiInstructions">Custom AI instructions</Label>
            <Textarea id="aiInstructions" name="aiInstructions" rows={3} defaultValue={org.ai_instructions ?? ""} />
          </div>
          <PrimaryButton type="submit">Save profile</PrimaryButton>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-900">Services</h2>
        <ul className="mt-3 divide-y divide-slate-100">
          {(services ?? []).map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-slate-800">{s.name}</p>
                {s.description && <p className="text-xs text-slate-500">{s.description}</p>}
              </div>
              <form action={deleteService}>
                <input type="hidden" name="id" value={s.id} />
                <SecondaryButton type="submit" className="px-2 py-1 text-xs">Remove</SecondaryButton>
              </form>
            </li>
          ))}
          {(services ?? []).length === 0 && <p className="py-2 text-sm text-slate-400">No services yet.</p>}
        </ul>
        <form action={addService} className="mt-4 grid grid-cols-3 gap-2">
          <Input name="name" placeholder="Service name" required />
          <Input name="description" placeholder="Description (optional)" />
          <Input name="pricingNote" placeholder="Pricing note (optional)" />
          <PrimaryButton type="submit" className="col-span-3">Add service</PrimaryButton>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-900">Service areas</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {(areas ?? []).map((a) => (
            <li key={a.id} className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm">
              {a.area}
              <form action={deleteServiceArea}>
                <input type="hidden" name="id" value={a.id} />
                <button type="submit" className="text-slate-400 hover:text-red-500">×</button>
              </form>
            </li>
          ))}
        </ul>
        <form action={addServiceArea} className="mt-4 flex gap-2">
          <Input name="area" placeholder="e.g. Austin, TX" required />
          <PrimaryButton type="submit">Add</PrimaryButton>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-900">Pricing rules</h2>
        <p className="text-xs text-slate-500">The AI will never quote a price that isn't covered here.</p>
        <ul className="mt-3 space-y-2">
          {(pricingRules ?? []).map((r) => (
            <li key={r.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
              {r.rule}
              <form action={deletePricingRule}>
                <input type="hidden" name="id" value={r.id} />
                <button type="submit" className="text-slate-400 hover:text-red-500">Remove</button>
              </form>
            </li>
          ))}
        </ul>
        <form action={addPricingRule} className="mt-4 flex gap-2">
          <Input name="rule" placeholder="e.g. Deep cleaning: $200 flat rate" required />
          <PrimaryButton type="submit">Add</PrimaryButton>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-900">FAQs</h2>
        <ul className="mt-3 space-y-3">
          {(faqs ?? []).map((f) => (
            <li key={f.id} className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-slate-800">{f.question}</p>
                  <p className="text-sm text-slate-600">{f.answer}</p>
                </div>
                <form action={deleteFaq}>
                  <input type="hidden" name="id" value={f.id} />
                  <button type="submit" className="shrink-0 text-slate-400 hover:text-red-500">Remove</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
        <form action={addFaq} className="mt-4 grid grid-cols-2 gap-2">
          <Input name="question" placeholder="Question" required />
          <Input name="answer" placeholder="Answer" required />
          <PrimaryButton type="submit" className="col-span-2">Add FAQ</PrimaryButton>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-900">Qualification questions</h2>
        <p className="text-xs text-slate-500">
          What the AI should try to learn before marking a lead "qualified".
        </p>
        <ul className="mt-3 space-y-2">
          {(questions ?? []).map((q) => (
            <li key={q.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
              {q.question}
              <form action={deleteQualificationQuestion}>
                <input type="hidden" name="id" value={q.id} />
                <button type="submit" className="text-slate-400 hover:text-red-500">Remove</button>
              </form>
            </li>
          ))}
        </ul>
        <form action={addQualificationQuestion} className="mt-4 flex gap-2">
          <Input name="question" placeholder="e.g. What is your preferred move-in date?" required />
          <PrimaryButton type="submit">Add</PrimaryButton>
        </form>
      </Card>
    </div>
  );
}
