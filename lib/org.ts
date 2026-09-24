import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type Organization = Database["public"]["Tables"]["organizations"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

/**
 * Loads the signed-in user's org, redirecting to /login or /onboarding as
 * appropriate. Every authenticated app page calls this first — it is the
 * single place that guarantees a page never renders without a valid,
 * onboarded tenant context.
 */
export async function requireOrg(): Promise<{ org: Organization; profile: Profile }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile?.org_id) redirect("/onboarding");

  const { data: org } = await supabase.from("organizations").select("*").eq("id", profile.org_id).single();
  if (!org) redirect("/onboarding");

  return { org, profile };
}
