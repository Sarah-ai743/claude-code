import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { LeadForm } from "./LeadForm";

interface Props {
  params: { slug: string };
}

export default async function ContactPage({ params }: Props) {
  const supabase = createAdminClient();
  // Service-role client, but selecting ONLY public-safe columns — see
  // supabase/migrations/0001_init.sql for why this table has no anon
  // SELECT policy of its own.
  const { data: org } = await supabase
    .from("organizations")
    .select("slug, name, description, languages, brand_tone")
    .eq("slug", params.slug)
    .maybeSingle();

  if (!org) notFound();

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-lg">
        <h1 className="text-2xl font-bold text-slate-900">Contact {org.name}</h1>
        {org.description && <p className="mt-2 text-slate-600">{org.description}</p>}
        <p className="mt-1 text-xs text-slate-400">
          {org.languages.length > 0
            ? `We respond in: ${org.languages.join(", ")} (and detect your language automatically).`
            : "We automatically detect and respond in your language."}
        </p>

        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <LeadForm slug={org.slug} businessName={org.name} />
        </div>
      </div>
    </main>
  );
}
