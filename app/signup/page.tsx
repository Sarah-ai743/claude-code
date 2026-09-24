import Link from "next/link";
import { signUp } from "@/lib/actions/auth";
import { ActionForm } from "@/components/ActionForm";
import { Input, Label, Card } from "@/components/ui";

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-sm p-8">
        <Link href="/" className="text-lg font-bold text-brand-700">
          LeadPilot AI
        </Link>
        <h1 className="mt-4 text-xl font-semibold text-slate-900">Create your account</h1>
        <p className="mt-1 text-sm text-slate-500">Start converting more leads today.</p>

        <div className="mt-6">
          <ActionForm action={signUp} submitLabel="Create account">
            <div>
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" name="fullName" type="text" required autoComplete="name" />
            </div>
            <div>
              <Label htmlFor="email">Work email</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
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

        <p className="mt-4 text-sm text-slate-500">
          Already have an account?{" "}
          <Link href="/login" className="text-brand-600 hover:underline">
            Log in
          </Link>
        </p>
      </Card>
    </main>
  );
}
