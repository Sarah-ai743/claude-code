import { describe, it, expect } from "vitest";
import { LeadAnalysisSchema, crossValidate } from "@/lib/ai/schema";
import { findUnsupportedPriceClaims } from "@/lib/guardrails";

/**
 * 30 AI conversation scenarios across industries, languages, and edge
 * cases named in the product spec.
 *
 * IMPORTANT — what this file does and does not test: this sandbox has no
 * live Anthropic API credentials or network access, so these are NOT live
 * calls to Claude. Each scenario is a customer message plus the JSON
 * output Claude is contractually required to produce for it (per
 * lib/ai/prompt.ts's system prompt), and the test verifies that output:
 * (a) satisfies the strict output schema, (b) is internally consistent
 * (crossValidate), and (c) triggers the price-guardrail when it should.
 * This proves the contract and the safety net around it are sound. It
 * does NOT prove Claude will actually produce this exact JSON for this
 * exact message — that requires an end-to-end run against the real API
 * with a real ANTHROPIC_API_KEY, which is not available here and should
 * be run before launch (see README "Known limitations").
 */

interface Scenario {
  name: string;
  customerMessage: string;
  output: Record<string, unknown>;
  expectGuardrailFlag?: boolean;
}

const scenarios: Scenario[] = [
  {
    name: "1. Cleaner — simple new enquiry, English",
    customerMessage: "Hi, I need my 2 bed apartment cleaned this Friday.",
    output: { language: "en", intent: "book a cleaning for a 2 bed apartment", requested_service: "Standard Cleaning", urgency: "medium", qualification_status: "needs_information", missing_information: ["exact address", "preferred time"], sentiment: "positive", recommended_action: "ask_question", reply: "We'd love to help! Could you share your address and a preferred time on Friday?", human_review_required: false, human_review_reason: null },
  },
  {
    name: "2. Plumber — urgent leak, high urgency",
    customerMessage: "URGENT — I have a burst pipe flooding my kitchen right now!",
    output: { language: "en", intent: "emergency leak repair", requested_service: "Emergency Plumbing", urgency: "high", qualification_status: "qualified", missing_information: [], sentiment: "negative", recommended_action: "send_booking_link", reply: "That sounds urgent — please call us immediately or use our booking link so we can dispatch a plumber right away.", human_review_required: false, human_review_reason: null },
  },
  {
    name: "3. Electrician — Spanish enquiry",
    customerMessage: "Hola, necesito instalar un enchufe nuevo en mi cocina.",
    output: { language: "es", intent: "instalar un enchufe nuevo", requested_service: "Electrical Installation", urgency: "low", qualification_status: "needs_information", missing_information: ["dirección", "disponibilidad"], sentiment: "neutral", recommended_action: "ask_question", reply: "¡Claro! ¿Podría indicarnos su dirección y cuándo le vendría bien la visita?", human_review_required: false, human_review_reason: null },
  },
  {
    name: "4. Roofer — price question not covered by pricing rules (uncertain price)",
    customerMessage: "How much would a full roof replacement cost for a 3000 sqft house?",
    output: { language: "en", intent: "get pricing for full roof replacement", requested_service: "Roof Replacement", urgency: "medium", qualification_status: "human_required", missing_information: ["roof material", "current condition"], sentiment: "neutral", recommended_action: "human_handoff", reply: "A project like that needs a proper on-site estimate — I'll have someone from our team reach out with accurate pricing.", human_review_required: true, human_review_reason: "Exact price for a large roof replacement is not covered by configured pricing rules." },
  },
  {
    name: "5. HVAC — French enquiry, AC not cooling",
    customerMessage: "Bonjour, ma climatisation ne refroidit plus depuis hier.",
    output: { language: "fr", intent: "réparer la climatisation qui ne refroidit plus", requested_service: "AC Repair", urgency: "high", qualification_status: "qualified", missing_information: [], sentiment: "neutral", recommended_action: "send_booking_link", reply: "Nous pouvons envoyer un technicien rapidement. Voici notre lien de réservation.", human_review_required: false, human_review_reason: null },
  },
  {
    name: "6. Auto detailing — booking ready",
    customerMessage: "I'd like the full interior + exterior detail package for my SUV, this Saturday at 10am works great.",
    output: { language: "en", intent: "book full detail package Saturday 10am", requested_service: "Full Detail Package", urgency: "medium", qualification_status: "booking_ready", missing_information: [], sentiment: "positive", recommended_action: "send_booking_link", reply: "Perfect — Saturday at 10am works! Please confirm your booking here.", human_review_required: false, human_review_reason: null },
  },
  {
    name: "7. Beauty salon — FAQ answered from approved knowledge",
    customerMessage: "Do you use cruelty-free products?",
    output: { language: "en", intent: "ask about cruelty-free products", requested_service: null, urgency: "low", qualification_status: "new", missing_information: [], sentiment: "neutral", recommended_action: "reply", reply: "Yes — all our products are cruelty-free! Is there a service I can help you book?", human_review_required: false, human_review_reason: null },
  },
  {
    name: "8. Photographer — German enquiry about wedding packages",
    customerMessage: "Hallo, bieten Sie Hochzeitsfotografie-Pakete an?",
    output: { language: "de", intent: "Informationen zu Hochzeitsfotografie-Paketen", requested_service: "Wedding Photography", urgency: "low", qualification_status: "needs_information", missing_information: ["Hochzeitsdatum", "Ort"], sentiment: "positive", recommended_action: "ask_question", reply: "Ja, gerne! Wann und wo findet Ihre Hochzeit statt?", human_review_required: false, human_review_reason: null },
  },
  {
    name: "9. Consultant — complaint about a previous engagement (must escalate)",
    customerMessage: "I'm extremely unhappy with the consulting report we received last month, it was full of errors.",
    output: { language: "en", intent: "complaint about prior consulting report quality", requested_service: null, urgency: "high", qualification_status: "human_required", missing_information: [], sentiment: "negative", recommended_action: "human_handoff", reply: "I'm very sorry to hear that. I'm escalating this to our team right away so they can make it right.", human_review_required: true, human_review_reason: "Complaint about prior work — requires human handling." },
  },
  {
    name: "10. Marketing agency — refund request (must escalate)",
    customerMessage: "This campaign didn't perform at all, I want a refund.",
    output: { language: "en", intent: "requesting a refund for underperforming campaign", requested_service: null, urgency: "high", qualification_status: "human_required", missing_information: [], sentiment: "frustrated", recommended_action: "human_handoff", reply: "I understand the frustration — refund requests need to be reviewed by our team directly, and someone will follow up with you shortly.", human_review_required: true, human_review_reason: "Refund request — always escalated to a human." },
  },
  {
    name: "11. Moving company — customer explicitly asks for a human",
    customerMessage: "Can I just talk to a real person please?",
    output: { language: "en", intent: "wants to speak with a human directly", requested_service: null, urgency: "medium", qualification_status: "human_required", missing_information: [], sentiment: "neutral", recommended_action: "human_handoff", reply: "Of course — connecting you with a member of our team now.", human_review_required: true, human_review_reason: "Customer explicitly asked for a human." },
  },
  {
    name: "12. Professional services — Mandarin enquiry",
    customerMessage: "你好，我想了解一下你们的报税服务。",
    output: { language: "zh", intent: "咨询报税服务", requested_service: "Tax Filing", urgency: "low", qualification_status: "needs_information", missing_information: ["申报类型", "截止日期"], sentiment: "neutral", recommended_action: "ask_question", reply: "您好！请问您需要申报个人所得税还是企业税？", human_review_required: false, human_review_reason: null },
  },
  {
    name: "13. Cleaner — request outside service area",
    customerMessage: "Do you clean homes in Denver? I'm 3 hours from your listed areas.",
    output: { language: "en", intent: "asking about service outside coverage area", requested_service: null, urgency: "low", qualification_status: "human_required", missing_information: [], sentiment: "neutral", recommended_action: "human_handoff", reply: "That's outside our usual service area, but let me check with the team whether we can make an exception.", human_review_required: true, human_review_reason: "Requested location is outside configured service areas." },
  },
  {
    name: "14. Plumber — low urgency routine maintenance",
    customerMessage: "No rush, but at some point I'd like my water heater serviced.",
    output: { language: "en", intent: "schedule routine water heater servicing", requested_service: "Water Heater Service", urgency: "low", qualification_status: "needs_information", missing_information: ["preferred week"], sentiment: "positive", recommended_action: "ask_question", reply: "Happy to help whenever suits you — is there a particular week you'd like us to come by?", human_review_required: false, human_review_reason: null },
  },
  {
    name: "15. Electrician — Portuguese enquiry",
    customerMessage: "Oi, vocês fazem instalação de chuveiro elétrico?",
    output: { language: "pt", intent: "instalação de chuveiro elétrico", requested_service: "Electrical Installation", urgency: "medium", qualification_status: "needs_information", missing_information: ["endereço", "modelo do chuveiro"], sentiment: "neutral", recommended_action: "ask_question", reply: "Sim, fazemos! Pode nos informar o endereço e o modelo do chuveiro?", human_review_required: false, human_review_reason: null },
  },
  {
    name: "16. Roofer — quote requested with photos mentioned",
    customerMessage: "I've attached photos of the damage, can you give me a quote?",
    output: { language: "en", intent: "quote request with damage photos provided", requested_service: "Roof Repair", urgency: "medium", qualification_status: "quote_requested", missing_information: [], sentiment: "neutral", recommended_action: "request_quote_review", reply: "Thanks for sending those — our team will review the photos and follow up with a quote shortly.", human_review_required: false, human_review_reason: null },
  },
  {
    name: "17. HVAC — sentiment frustrated, second contact this week",
    customerMessage: "This is the second time I'm reaching out, nobody replied to my last message!",
    output: { language: "en", intent: "frustrated about lack of response to prior message", requested_service: null, urgency: "high", qualification_status: "human_required", missing_information: [], sentiment: "frustrated", recommended_action: "human_handoff", reply: "I'm really sorry about that delay — I'm flagging this for a team member to reach out to you personally right away.", human_review_required: true, human_review_reason: "Customer frustration about being ignored — escalate to a human." },
  },
  {
    name: "18. Auto detailing — Arabic enquiry (RTL language)",
    customerMessage: "مرحبا، هل يمكنني حجز موعد لتنظيف السيارة غدا؟",
    output: { language: "ar", intent: "حجز موعد لتنظيف السيارة غدا", requested_service: "Car Detailing", urgency: "medium", qualification_status: "needs_information", missing_information: ["الوقت المفضل"], sentiment: "positive", recommended_action: "ask_question", reply: "بالتأكيد! ما هو الوقت المفضل لديك غدا؟", human_review_required: false, human_review_reason: null },
  },
  {
    name: "19. Beauty salon — booking-ready with specific time",
    customerMessage: "Book me for a gel manicure tomorrow at 2pm please.",
    output: { language: "en", intent: "book gel manicure tomorrow at 2pm", requested_service: "Gel Manicure", urgency: "medium", qualification_status: "booking_ready", missing_information: [], sentiment: "positive", recommended_action: "send_booking_link", reply: "You're all set — here's the link to confirm your 2pm gel manicure tomorrow.", human_review_required: false, human_review_reason: null },
  },
  {
    name: "20. Photographer — vague message needing clarification",
    customerMessage: "hi",
    output: { language: "en", intent: "unclear — greeting only", requested_service: null, urgency: "low", qualification_status: "new", missing_information: ["what service they're interested in"], sentiment: "neutral", recommended_action: "ask_question", reply: "Hi there! What can we help you with today?", human_review_required: false, human_review_reason: null },
  },
  {
    name: "21. Consultant — low confidence, ambiguous scope (must escalate)",
    customerMessage: "We might need some kind of strategy thing, not totally sure what though.",
    output: { language: "en", intent: "vague interest in unspecified strategy consulting", requested_service: null, urgency: "low", qualification_status: "human_required", missing_information: ["specific goals"], sentiment: "neutral", recommended_action: "human_handoff", reply: "Happy to help figure that out — let me connect you with a consultant to discuss your goals.", human_review_required: true, human_review_reason: "Low confidence in scope; needs a human to scope the engagement." },
  },
  {
    name: "22. Marketing agency — Italian enquiry",
    customerMessage: "Ciao, offrite gestione dei social media per piccole aziende?",
    output: { language: "it", intent: "richiesta gestione social media per piccola azienda", requested_service: "Social Media Management", urgency: "low", qualification_status: "needs_information", missing_information: ["settore", "budget"], sentiment: "positive", recommended_action: "ask_question", reply: "Sì, certo! Può dirci il settore della sua azienda e il budget indicativo?", human_review_required: false, human_review_reason: null },
  },
  {
    name: "23. Moving company — international phone number provided",
    customerMessage: "You can reach me at +44 20 7946 0958, I'm moving from London to Manchester.",
    output: { language: "en", intent: "moving from London to Manchester", requested_service: "Long-distance Move", urgency: "medium", qualification_status: "needs_information", missing_information: ["move date", "inventory size"], sentiment: "positive", recommended_action: "ask_question", reply: "Great, thanks! What date are you planning to move, and roughly how much are you moving?", human_review_required: false, human_review_reason: null },
  },
  {
    name: "24. Professional services — opt-out request embedded in message",
    customerMessage: "Please stop contacting me, I'm not interested anymore.",
    output: { language: "en", intent: "opting out of further contact", requested_service: null, urgency: "low", qualification_status: "human_required", missing_information: [], sentiment: "negative", recommended_action: "no_action", reply: "Understood — we won't contact you again. Take care!", human_review_required: true, human_review_reason: "Customer opted out; flagged so no further automated contact occurs." },
  },
  {
    name: "25. Cleaner — Dutch enquiry with pricing already known to customer (supported price)",
    customerMessage: "Ik zag dat een standaardschoonmaak $120 kost, klopt dat?",
    output: { language: "nl", intent: "bevestigen van de prijs voor standaardschoonmaak", requested_service: "Standard Cleaning", urgency: "low", qualification_status: "qualified", missing_information: [], sentiment: "neutral", recommended_action: "reply", reply: "Dat klopt, $120 voor een standaardschoonmaak. Zullen we een afspraak inplannen?", human_review_required: false, human_review_reason: null },
  },
  {
    name: "26. Roofer — reply invents an unsupported price (guardrail must catch this)",
    customerMessage: "What's your price for gutter cleaning?",
    output: { language: "en", intent: "asking price for gutter cleaning", requested_service: "Gutter Cleaning", urgency: "low", qualification_status: "qualified", missing_information: [], sentiment: "neutral", recommended_action: "reply", reply: "Gutter cleaning is $85 flat rate.", human_review_required: false, human_review_reason: null },
    expectGuardrailFlag: true,
  },
  {
    name: "27. HVAC — Polish enquiry, urgent no heat in winter",
    customerMessage: "Cześć, nie mam ogrzewania a jest bardzo zimno, proszę o pomoc!",
    output: { language: "pl", intent: "brak ogrzewania, pilna pomoc", requested_service: "Heating Repair", urgency: "high", qualification_status: "qualified", missing_information: [], sentiment: "negative", recommended_action: "send_booking_link", reply: "Rozumiemy pilność sytuacji — oto link do szybkiej rezerwacji wizyty technika.", human_review_required: false, human_review_reason: null },
  },
  {
    name: "28. Beauty salon — allergy/medical concern (sensitive, must escalate)",
    customerMessage: "I have a severe allergy to certain chemicals, can you guarantee the products won't trigger it?",
    output: { language: "en", intent: "asking about allergy safety of products", requested_service: null, urgency: "medium", qualification_status: "human_required", missing_information: ["specific allergen"], sentiment: "neutral", recommended_action: "human_handoff", reply: "That's important — let me have a specialist confirm ingredient safety with you directly before booking.", human_review_required: true, human_review_reason: "Medical/allergy safety question — cannot be answered from general FAQs." },
  },
  {
    name: "29. Photographer — duplicate-looking follow-up message, no action needed",
    customerMessage: "(sent by mistake, ignore this)",
    output: { language: "en", intent: "no actionable request", requested_service: null, urgency: "low", qualification_status: "new", missing_information: [], sentiment: "neutral", recommended_action: "no_action", reply: "No worries at all — let us know if there's anything we can help with!", human_review_required: false, human_review_reason: null },
  },
  {
    name: "30. Consultant — Hindi enquiry about business consulting",
    customerMessage: "नमस्ते, क्या आप छोटे व्यवसायों के लिए परामर्श सेवाएं प्रदान करते हैं?",
    output: { language: "hi", intent: "छोटे व्यवसायों के लिए परामर्श सेवाओं के बारे में पूछताछ", requested_service: "Business Consulting", urgency: "low", qualification_status: "needs_information", missing_information: ["व्यवसाय का प्रकार", "बजट"], sentiment: "positive", recommended_action: "ask_question", reply: "नमस्ते! कृपया बताएं आपका व्यवसाय किस क्षेत्र में है?", human_review_required: false, human_review_reason: null },
  },
];

describe("30 AI conversation scenarios", () => {
  it.each(scenarios)("$name", (scenario) => {
    const parsed = LeadAnalysisSchema.safeParse(scenario.output);
    expect(parsed.success, `schema validation failed: ${!parsed.success ? JSON.stringify(parsed.error.issues) : ""}`).toBe(true);
    if (!parsed.success) return;

    const problems = crossValidate(parsed.data);
    expect(problems, `cross-validation failed: ${problems.join("; ")}`).toHaveLength(0);

    const flagged = findUnsupportedPriceClaims(parsed.data.reply, scenario.customerMessage);
    if (scenario.expectGuardrailFlag) {
      expect(flagged.length).toBeGreaterThan(0);
    } else {
      expect(flagged, `unexpected unsupported price claim: ${flagged.join(", ")}`).toHaveLength(0);
    }
  });

  it("covers at least 30 scenarios", () => {
    expect(scenarios.length).toBeGreaterThanOrEqual(30);
  });

  it("covers a range of languages", () => {
    const languages = new Set(scenarios.map((s) => (s.output as { language: string }).language));
    expect(languages.size).toBeGreaterThanOrEqual(10);
  });

  it("covers every recommended_action value at least once", () => {
    const actions = new Set(scenarios.map((s) => (s.output as { recommended_action: string }).recommended_action));
    expect(actions).toEqual(
      new Set(["reply", "ask_question", "send_booking_link", "request_quote_review", "human_handoff", "no_action"]),
    );
  });
});
