import Link from "next/link";
import { requireOrg } from "@/lib/org";
import { signOut } from "@/lib/actions/auth";
import { PrimaryButton } from "@/components/ui";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/inbox", label: "Inbox" },
  { href: "/leads", label: "Pipeline" },
  { href: "/knowledge", label: "Business Knowledge" },
  { href: "/automation", label: "Automation" },
  { href: "/integrations", label: "Integrations" },
  { href: "/settings", label: "Settings" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { org, profile } = await requireOrg();

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white md:flex md:flex-col">
        <div className="border-b border-slate-200 px-5 py-4">
          <Link href="/dashboard" className="text-lg font-bold text-brand-700">
            LeadPilot AI
          </Link>
          <p className="mt-1 truncate text-xs text-slate-500">{org.name}</p>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-slate-200 px-3 py-4">
          <p className="truncate px-3 text-xs text-slate-500">{profile.email}</p>
          <form action={signOut}>
            <button
              type="submit"
              className="mt-2 w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Log out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <div className="flex items-center justify-between">
            <span className="font-bold text-brand-700">LeadPilot AI</span>
            <form action={signOut}>
              <PrimaryButton type="submit" className="px-3 py-1 text-xs">
                Log out
              </PrimaryButton>
            </form>
          </div>
          <nav className="mt-3 flex gap-3 overflow-x-auto text-sm font-medium text-slate-600">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="shrink-0 whitespace-nowrap hover:text-slate-900">
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
