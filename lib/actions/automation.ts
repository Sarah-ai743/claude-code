"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import type { AutomationMode } from "@/lib/supabase/database.types";

export async function updateAutomationMode(formData: FormData): Promise<void> {
  const { org } = await requireOrg();
  const supabase = createClient();
  const mode = String(formData.get("mode")) as AutomationMode;
  if (!["draft", "safe_autopilot", "autopilot"].includes(mode)) return;

  await supabase.from("organizations").update({ automation_mode: mode }).eq("id", org.id);
  revalidatePath("/automation");
}

export async function updateFollowupSettings(formData: FormData): Promise<void> {
  const { org } = await requireOrg();
  const supabase = createClient();

  await supabase.from("followup_settings").upsert({
    org_id: org.id,
    first_delay_hours: Number(formData.get("firstDelayHours") ?? 24),
    second_delay_hours: Number(formData.get("secondDelayHours") ?? 72),
    max_followups: Number(formData.get("maxFollowups") ?? 2),
    allowed_start_hour: Number(formData.get("allowedStartHour") ?? 9),
    allowed_end_hour: Number(formData.get("allowedEndHour") ?? 18),
    updated_at: new Date().toISOString(),
  });

  revalidatePath("/automation");
}
