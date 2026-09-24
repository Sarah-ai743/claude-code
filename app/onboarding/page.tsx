"use client";

import { useState, useTransition } from "react";
import { completeOnboarding, type OnboardingInput } from "@/lib/actions/onboarding";
import { Input, Label, Textarea, Select, Card, PrimaryButton, SecondaryButton } from "@/components/ui";

const STEPS = ["Business basics", "Services & hours", "Knowledge & pricing", "Booking & contact"] as const;

const LANGUAGE_OPTIONS = ["en", "es", "fr", "de", "pt", "ar", "zh", "hi", "it", "nl", "pl", "tr"];

type Draft = {
  name: string;
  industry: string;
  country: string;
  timezone: string;
  currency: string;
  languages: string[];
  website: string;
  description: string;
  servicesText: string;
  serviceAreasText: string;
  businessHoursStart: string;
  businessHoursEnd: string;
  faqsText: string;
  pricingRulesText: string;
  qualificationQuestionsText: string;
  bookingUrl: string;
  contactEmail: string;
  contactPhone: string;
  brandTone: string;
  aiInstructions: string;
};

const INITIAL: Draft = {
  name: "",
  industry: "",
  country: "",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  currency: "USD",
  languages: ["en"],
  website: "",
  description: "",
  servicesText: "",
  serviceAreasText: "",
  businessHoursStart: "09:00",
  businessHoursEnd: "17:00",
  faqsText: "",
  pricingRulesText: "",
  qualificationQuestionsText: "",
  bookingUrl: "",
  contactEmail: "",
  contactPhone: "",
  brandTone: "friendly and professional",
  aiInstructions: "",
};

function parseLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseServices(text: string): { name: string; description?: string }[] {
  return parseLines(text).map((line) => {
    const [name, ...rest] = line.split("-");
    return { name: (name ?? line).trim(), description: rest.join("-").trim() || undefined };
  });
}

function parseFaqs(text: string): { question: string; answer: string }[] {
  return parseLines(text)
    .map((line) => {
      const [question, ...rest] = line.split("|");
      return { question: (question ?? "").trim(), answer: rest.join("|").trim() };
    })
    .filter((f) => f.question && f.answer);
}

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(INITIAL);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function toggleLanguage(code: string) {
    setDraft((prev) => ({
      ...prev,
      languages: prev.languages.includes(code)
        ? prev.languages.filter((l) => l !== code)
        : [...prev.languages, code],
    }));
  }

  function next() {
    setError(null);
    if (step === 0 && (!draft.name || !draft.industry || !draft.country || !draft.contactEmail)) {
      setError("Please fill in business name, industry, country, and contact email.");
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  function submit() {
    setError(null);
    const input: OnboardingInput = {
      name: draft.name,
      industry: draft.industry,
      country: draft.country,
      timezone: draft.timezone,
      currency: draft.currency,
      languages: draft.languages,
      website: draft.website || null,
      description: draft.description || null,
      services: parseServices(draft.servicesText),
      serviceAreas: parseLines(draft.serviceAreasText),
      businessHoursStart: draft.businessHoursStart,
      businessHoursEnd: draft.businessHoursEnd,
      faqs: parseFaqs(draft.faqsText),
      pricingRules: parseLines(draft.pricingRulesText),
      qualificationQuestions: parseLines(draft.qualificationQuestionsText),
      bookingUrl: draft.bookingUrl || null,
      contactEmail: draft.contactEmail,
      contactPhone: draft.contactPhone || null,
      brandTone: draft.brandTone || null,
      aiInstructions: draft.aiInstructions || null,
    };

    startTransition(async () => {
      const result = await completeOnboarding(input);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-slate-900">Set up your business</h1>
        <p className="mt-1 text-sm text-slate-500">
          This tells your AI assistant everything it's allowed to say — it will never go beyond what you enter here.
        </p>

        <div className="mt-6 flex gap-2">
          {STEPS.map((label, index) => (
            <div
              key={label}
              className={`h-1.5 flex-1 rounded-full ${index <= step ? "bg-brand-600" : "bg-slate-200"}`}
            />
          ))}
        </div>

        <Card className="mt-4 p-6">
          <h2 className="text-lg font-semibold text-slate-900">{STEPS[step]}</h2>

          {step === 0 && (
            <div className="mt-4 space-y-4">
              <div>
                <Label htmlFor="name">Business name</Label>
                <Input id="name" value={draft.name} onChange={(e) => update("name", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="industry">Industry</Label>
                  <Input
                    id="industry"
                    placeholder="e.g. Residential cleaning"
                    value={draft.industry}
                    onChange={(e) => update("industry", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="country">Country</Label>
                  <Input id="country" value={draft.country} onChange={(e) => update("country", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="timezone">Timezone</Label>
                  <Input id="timezone" value={draft.timezone} onChange={(e) => update("timezone", e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="currency">Currency</Label>
                  <Input id="currency" value={draft.currency} onChange={(e) => update("currency", e.target.value.toUpperCase())} />
                </div>
              </div>
              <div>
                <Label>Supported languages</Label>
                <div className="flex flex-wrap gap-2">
                  {LANGUAGE_OPTIONS.map((code) => (
                    <button
                      type="button"
                      key={code}
                      onClick={() => toggleLanguage(code)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${
                        draft.languages.includes(code)
                          ? "border-brand-600 bg-brand-50 text-brand-700"
                          : "border-slate-300 text-slate-600"
                      }`}
                    >
                      {code}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label htmlFor="website">Website (optional)</Label>
                <Input id="website" value={draft.website} onChange={(e) => update("website", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="description">Business description</Label>
                <Textarea
                  id="description"
                  rows={3}
                  value={draft.description}
                  onChange={(e) => update("description", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="contactEmail">Contact email</Label>
                <Input
                  id="contactEmail"
                  type="email"
                  value={draft.contactEmail}
                  onChange={(e) => update("contactEmail", e.target.value)}
                />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="mt-4 space-y-4">
              <div>
                <Label htmlFor="services">Services (one per line, optionally "Name - description")</Label>
                <Textarea
                  id="services"
                  rows={5}
                  placeholder={"Standard cleaning - full home clean\nDeep cleaning - includes appliances"}
                  value={draft.servicesText}
                  onChange={(e) => update("servicesText", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="areas">Service areas (one per line)</Label>
                <Textarea
                  id="areas"
                  rows={3}
                  placeholder={"Austin, TX\nRound Rock, TX"}
                  value={draft.serviceAreasText}
                  onChange={(e) => update("serviceAreasText", e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="hoursStart">Business hours start</Label>
                  <Input
                    id="hoursStart"
                    type="time"
                    value={draft.businessHoursStart}
                    onChange={(e) => update("businessHoursStart", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="hoursEnd">Business hours end</Label>
                  <Input
                    id="hoursEnd"
                    type="time"
                    value={draft.businessHoursEnd}
                    onChange={(e) => update("businessHoursEnd", e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="mt-4 space-y-4">
              <div>
                <Label htmlFor="faqs">FAQs (one per line, "Question | Answer")</Label>
                <Textarea
                  id="faqs"
                  rows={4}
                  placeholder={"Do you bring your own supplies? | Yes, all supplies included."}
                  value={draft.faqsText}
                  onChange={(e) => update("faqsText", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="pricing">Pricing rules (one per line — the ONLY source the AI may quote from)</Label>
                <Textarea
                  id="pricing"
                  rows={4}
                  placeholder={"Standard cleaning starts at $120 for homes up to 1500 sq ft"}
                  value={draft.pricingRulesText}
                  onChange={(e) => update("pricingRulesText", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="qq">Qualification questions (one per line)</Label>
                <Textarea
                  id="qq"
                  rows={3}
                  placeholder={"What is your home's square footage?\nWhat date are you looking to book?"}
                  value={draft.qualificationQuestionsText}
                  onChange={(e) => update("qualificationQuestionsText", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="tone">Brand tone</Label>
                <Input id="tone" value={draft.brandTone} onChange={(e) => update("brandTone", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="instructions">Custom AI instructions (optional)</Label>
                <Textarea
                  id="instructions"
                  rows={3}
                  value={draft.aiInstructions}
                  onChange={(e) => update("aiInstructions", e.target.value)}
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="mt-4 space-y-4">
              <div>
                <Label htmlFor="bookingUrl">Booking URL (optional)</Label>
                <Input id="bookingUrl" value={draft.bookingUrl} onChange={(e) => update("bookingUrl", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="phone">Contact phone (optional)</Label>
                <Input id="phone" value={draft.contactPhone} onChange={(e) => update("contactPhone", e.target.value)} />
              </div>
              <p className="text-sm text-slate-500">
                Review your entries with the Back button, then finish setup. You can edit everything later in
                Business Knowledge.
              </p>
            </div>
          )}

          {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div className="mt-6 flex justify-between">
            <SecondaryButton type="button" onClick={back} disabled={step === 0}>
              Back
            </SecondaryButton>
            {step < STEPS.length - 1 ? (
              <PrimaryButton type="button" onClick={next}>
                Continue
              </PrimaryButton>
            ) : (
              <PrimaryButton type="button" onClick={submit} disabled={pending}>
                {pending ? "Setting up…" : "Finish setup"}
              </PrimaryButton>
            )}
          </div>
        </Card>
      </div>
    </main>
  );
}
