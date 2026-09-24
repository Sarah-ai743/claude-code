"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { PrimaryButton } from "./ui";

export interface ActionResult {
  error?: string;
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <PrimaryButton type="submit" disabled={pending} className="w-full">
      {pending ? "Please wait…" : label}
    </PrimaryButton>
  );
}

export function ActionForm({
  action,
  submitLabel,
  children,
}: {
  action: (state: ActionResult, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
  children: ReactNode;
}) {
  const [state, formAction] = useFormState(action, {});

  return (
    <form action={formAction} className="space-y-4">
      {children}
      {state?.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      ) : null}
      <SubmitButton label={submitLabel} />
    </form>
  );
}
