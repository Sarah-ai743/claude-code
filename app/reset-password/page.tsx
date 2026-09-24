"use client";

import Link from "next/link";
import { useFormState } from "react-dom";
import { requestPasswordReset } from "@/lib/actions/auth";
import { Input, Label, Card, PrimaryButton } from "@/components/ui";

export default function ResetPasswordPage() {
  const [state, formAction] = useFormState(requestPasswordReset, {});

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-sm p-8">
        <Link href="/" className="text-lg font-bold text-brand-700">
          LeadPilot AI
        </Link>
        <h1 className="mt-4 text-xl font-semibold text-slate-900">Reset your password</h1>
        <p className="mt-1 text-sm text-slate-500">
          We&apos;ll email you a link to set a new password.
        </p>

        {state?.sent ? (
          <p className="mt-6 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            If an account exists for that email, a reset link is on its way.
          </p>
        ) : (
          <form action={formAction} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            {state?.error ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
            ) : null}
            <PrimaryButton type="submit" className="w-full">
              Send reset link
            </PrimaryButton>
          </form>
        )}

        <p className="mt-4 text-sm text-slate-500">
          <Link href="/login" className="text-brand-600 hover:underline">
            Back to login
          </Link>
        </p>
      </Card>
    </main>
  );
}
