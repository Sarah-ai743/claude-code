"use client";

import { Select } from "@/components/ui";
import type { LeadStage } from "@/lib/supabase/database.types";

export function StageSelect({
  stages,
  defaultValue,
}: {
  stages: { key: LeadStage; label: string }[];
  defaultValue: string;
}) {
  return (
    <Select
      name="stage"
      defaultValue={defaultValue}
      className="text-xs"
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
    >
      {stages.map((s) => (
        <option key={s.key} value={s.key}>
          {s.label}
        </option>
      ))}
    </Select>
  );
}
