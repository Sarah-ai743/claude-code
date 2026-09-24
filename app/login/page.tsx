import Link from "next/link";
import { signIn } from "@/lib/actions/auth";
import { ActionForm } from "@/components/ActionForm";
import { Input, Label, Card } from "@/components/ui";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-sm p-8">
        <Link href="/" className="text-lg font-bold text-brand-700">
          LeadPilot AI
        </Link>
        <h1 className="mt-4 text-xl font-semibold text-slate-900">Log in</h1>
        <p className="mt-1 text-sm text-slate-500">Welcome back. Enter your details below.</p>

        <div className="mt-6">
          <ActionForm action={signIn} submitLabel="Log in">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" required autoComplete="current-password" />
            </div>
          </ActionForm>
        </div>

        <div className="mt-4 flex justify-between text-sm">
          <Link href="/reset-password" className="text-brand-600 hover:underline">
            Forgot password?
          </Link>
          <Link href="/signup" className="text-brand-600 hover:underline">
            Create account
          </Link>
        </div>
      </Card>
    </main>
  );
}
