import Link from "next/link";
import { Card, PrimaryButton, SecondaryButton, Badge } from "@/components/ui";

const PLANS = [
  {
    name: "Starter",
    price: "$49",
    period: "/mo",
    description: "For a single business getting started with AI lead response.",
    features: ["1 workspace", "Up to 200 leads/mo", "Draft & Safe Autopilot modes", "Email support"],
  },
  {
    name: "Growth",
    price: "$149",
    period: "/mo",
    description: "For growing teams that want full autopilot and more volume.",
    features: ["1 workspace", "Up to 1,000 leads/mo", "All automation modes", "Follow-up automation", "Priority support"],
    highlighted: true,
  },
  {
    name: "Pro",
    price: "$349",
    period: "/mo",
    description: "For established businesses with higher volume and multiple team members.",
    features: ["1 workspace, multiple agents", "Up to 5,000 leads/mo", "All automation modes", "Advanced analytics", "Priority support"],
  },
  {
    name: "Agency",
    price: "Contact us",
    period: "",
    description: "For agencies managing lead conversion for multiple client businesses.",
    features: ["Multiple workspaces", "Custom lead volume", "Dedicated onboarding", "SLA support"],
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-white">
      <header className="border-b border-slate-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="text-lg font-bold text-brand-700">LeadPilot AI</Link>
          <Link href="/signup"><PrimaryButton>Get started</PrimaryButton></Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-16 text-center">
        <h1 className="text-3xl font-bold text-slate-900">Simple, predictable pricing</h1>
        <p className="mt-2 text-slate-600">Choose the plan that fits your lead volume. Cancel anytime.</p>
        <p className="mt-1 text-xs text-slate-400">
          Billing is not yet active on this MVP — plans are shown for reference; no card is charged today.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-4">
          {PLANS.map((plan) => (
            <Card
              key={plan.name}
              className={`flex flex-col p-6 text-left ${plan.highlighted ? "ring-2 ring-brand-500" : ""}`}
            >
              {plan.highlighted && <Badge tone="blue">Most popular</Badge>}
              <h2 className="mt-2 text-lg font-bold text-slate-900">{plan.name}</h2>
              <p className="mt-1 text-3xl font-extrabold text-slate-900">
                {plan.price}
                <span className="text-base font-medium text-slate-500">{plan.period}</span>
              </p>
              <p className="mt-2 text-sm text-slate-500">{plan.description}</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-600">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-brand-600">✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className="mt-6">
                {plan.highlighted ? (
                  <PrimaryButton className="w-full">Choose {plan.name}</PrimaryButton>
                ) : (
                  <SecondaryButton className="w-full">Choose {plan.name}</SecondaryButton>
                )}
              </Link>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
