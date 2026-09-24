import Link from "next/link";
import { updatePassword } from "@/lib/actions/auth";
import { ActionForm } from "@/components/ActionForm";
import { Input, Label, Card } from "@/components/ui";

export default function ConfirmResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-sm p-8">
        <Link href="/" className="text-lg font-bold text-brand-700">
          LeadPilot AI
        </Link>
        <h1 className="mt-4 text-xl font-semibold text-slate-900">Set a new password</h1>
        <p className="mt-1 text-sm text-slate-500">
          Choose a new password for your account.
        </p>

        <div className="mt-6">
          <ActionForm action={updatePassword} submitLabel="Update password">
            <div>
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
          </ActionForm>
        </div>
      </Card>
    </main>
  );
}
