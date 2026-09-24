import Link from "next/link";
import { PrimaryButton, SecondaryButton, Card, Badge } from "@/components/ui";

const USE_CASES = [
  "Cleaners", "Plumbers", "Electricians", "Roofers", "HVAC", "Auto detailing",
  "Beauty salons", "Photographers", "Consultants", "Marketing agencies",
  "Moving companies", "Professional services",
];

const FEATURES = [
  { title: "Multilingual by default", body: "Detects the customer's language automatically and replies in it — no setup per language." },
  { title: "Grounded in your knowledge", body: "Claude only answers from the services, pricing, and FAQs you approve. It never invents a price or a policy." },
  { title: "Three levels of control", body: "Draft, Safe Autopilot, or full Autopilot — you decide how much runs without you." },
  { title: "Automatic qualification", body: "Asks the right follow-up questions and tracks what's still missing before a lead is call-ready." },
  { title: "Persistent follow-ups", body: "Scheduled, timezone-aware follow-ups that survive restarts and stop the moment a customer opts out." },
  { title: "One inbox, one pipeline", body: "Every conversation and every stage — New through Won — in a single view." },
];

const FAQS = [
  { q: "Does this replace my team?", a: "No — it handles first response and qualification so your team spends time on ready-to-book leads, and it hands off anything uncertain." },
  { q: "What happens if the AI isn't sure?", a: "It escalates to a human. Complaints, refund requests, pricing it can't verify, and anything outside your configured rules always go to a person." },
  { q: "Can I review replies before they send?", a: "Yes — Draft mode requires your approval on everything. Safe Autopilot only auto-sends routine replies." },
  { q: "What languages are supported?", a: "The AI detects the customer's language automatically and can reply in it, subject to your own configuration." },
];

export default function LandingPage() {
  return (
    <main className="bg-white">
      <header className="border-b border-slate-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <span className="text-lg font-bold text-brand-700">LeadPilot AI</span>
          <nav className="hidden gap-6 text-sm font-medium text-slate-600 md:flex">
            <Link href="#how-it-works" className="hover:text-slate-900">How it works</Link>
            <Link href="#features" className="hover:text-slate-900">Features</Link>
            <Link href="/pricing" className="hover:text-slate-900">Pricing</Link>
            <Link href="#faq" className="hover:text-slate-900">FAQ</Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900">Log in</Link>
            <Link href="/signup">
              <PrimaryButton>Get started</PrimaryButton>
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-20 text-center">
        <Badge tone="blue">Now in early access</Badge>
        <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          Your 24/7 multilingual AI lead-conversion team
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
          LeadPilot AI responds to leads, qualifies prospects, and follows up automatically —
          turning more enquiries into customers, in any language, around the clock.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/signup"><PrimaryButton className="px-6 py-3 text-base">Start free</PrimaryButton></Link>
          <Link href="/pricing"><SecondaryButton className="px-6 py-3 text-base">See pricing</SecondaryButton></Link>
        </div>
      </section>

      <section id="how-it-works" className="border-t border-slate-100 bg-slate-50 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-2xl font-bold text-slate-900">How it works</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-4">
            {[
              ["1. A lead comes in", "From your hosted contact form or your own site — name, email, and what they need."],
              ["2. Claude analyzes it", "Language, intent, urgency, and qualification status, grounded in your approved business knowledge."],
              ["3. It replies or asks", "A relevant reply, or the next qualifying question — sent automatically or held for your approval."],
              ["4. It follows up", "Scheduled, timezone-aware nudges until the lead is booking-ready, opts out, or you take over."],
            ].map(([title, body]) => (
              <Card key={title} className="p-5">
                <h3 className="font-semibold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm text-slate-600">{body}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-2xl font-bold text-slate-900">Built for round-the-clock, global enquiries</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <Card className="p-6">
              <h3 className="font-semibold text-slate-900">24/7, without a night shift</h3>
              <p className="mt-2 text-sm text-slate-600">
                A lead at 2am gets qualified and answered before your team logs on — with the same rules you set,
                every time.
              </p>
            </Card>
            <Card className="p-6">
              <h3 className="font-semibold text-slate-900">Multilingual from the first message</h3>
              <p className="mt-2 text-sm text-slate-600">
                The customer's language is detected automatically and the reply matches it, with support for
                international phone numbers, currencies, and timezones.
              </p>
            </Card>
          </div>
        </div>
      </section>

      <section id="features" className="border-t border-slate-100 bg-slate-50 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-2xl font-bold text-slate-900">Features</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {FEATURES.map((f) => (
              <Card key={f.title} className="p-5">
                <h3 className="font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{f.body}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-6xl px-4 text-center">
          <h2 className="text-2xl font-bold text-slate-900">Built for any lead-driven business</h2>
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {USE_CASES.map((u) => (
              <Badge key={u} tone="slate">{u}</Badge>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="border-t border-slate-100 bg-slate-50 py-16">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="text-center text-2xl font-bold text-slate-900">Frequently asked questions</h2>
          <div className="mt-8 space-y-4">
            {FAQS.map((f) => (
              <Card key={f.q} className="p-5">
                <h3 className="font-semibold text-slate-900">{f.q}</h3>
                <p className="mt-2 text-sm text-slate-600">{f.a}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-brand-600 py-16 text-center text-white">
        <h2 className="text-2xl font-bold">Ready to stop losing leads?</h2>
        <p className="mt-2 text-brand-100">Set up your AI assistant in minutes.</p>
        <Link href="/signup" className="mt-6 inline-block">
          <button className="rounded-lg bg-white px-6 py-3 text-base font-semibold text-brand-700 shadow-sm hover:bg-brand-50">
            Create your account
          </button>
        </Link>
      </section>

      <footer className="border-t border-slate-100 py-8 text-center text-sm text-slate-400">
        © {new Date().getFullYear()} LeadPilot AI. <Link href="/pricing" className="hover:text-slate-600">Pricing</Link>
      </footer>
    </main>
  );
}
