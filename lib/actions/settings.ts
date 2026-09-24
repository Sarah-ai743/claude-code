"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";

export async function requestAccountDeletion(): Promise<void> {
  const { org, profile } = await requireOrg();
  const supabase = createClient();
  await supabase.from("activity_log").insert({
    org_id: org.id,
    actor: profile.email,
    action: "deletion_requested",
    metadata: { requestedAt: new Date().toISOString() },
  });
  revalidatePath("/settings");
}

export async function updatePlan(formData: FormData): Promise<void> {
  const { org } = await requireOrg();
  const supabase = createClient();
  const plan = String(formData.get("plan") ?? "starter");
  await supabase.from("organizations").update({ plan }).eq("id", org.id);
  revalidatePath("/settings");
}
