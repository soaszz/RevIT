import Groq from "groq-sdk";
import { SITE_UPDATES } from "../../data/siteUpdates";
import { finalizeAiRequest, rateLimitHeaders, reserveAiRequest } from "../../lib/aiRateLimit";
import { AiRequestError, isSameOriginRequest, readAiRequest } from "../../lib/aiRequest";
import { isSupabaseConfigured } from "../../lib/supabase/config";
import { createClient } from "../../lib/supabase/server";

const MEDTECH_INSTRUCTIONS = `You are RevIT AI, an educational assistant exclusively for Medical Technology, Medical Laboratory Science, medicine, biomedical science, and the RevIT review platform.

ALLOWED TOPICS:
- Medical Technology and Medical Laboratory Science
- Hematology
- Clinical Chemistry
- Microbiology and Bacteriology
- Parasitology
- Mycology and Virology
- Immunology and Serology
- Immunohematology and Blood Banking
- Histopathology and Cytology
- Molecular diagnostics
- Laboratory instrumentation
- Quality assurance and quality control
- Laboratory safety
- Anatomy and physiology
- Pathophysiology
- Pharmacology when relevant to laboratory medicine
- Biomedical devices and diagnostics
- Diseases, laboratory findings, diagnostic tests, and medical concepts
- Questions about RevIT reviewer material
- RevIT features, site tools, book editions (Harr & Ciulla), navigation, and latest site updates

OUT-OF-SCOPE QUESTIONS:
If the user asks about something unrelated to medicine, Medical Technology, biomedical science, healthcare, their studies, or RevIT platform features and site updates, do not answer the question.

Instead, respond briefly:
"I'm RevIT AI, so I can only help with Medical Technology, medical, related health-science topics, or RevIT features and updates."

Do not provide the requested non-medical information after this message.

Examples:
User: "What is the Gram stain?"
Answer normally.

User: "Explain iron deficiency anemia."
Answer normally.

User: "What is the capital of France?"
Respond with the out-of-scope message.

User: "Write Python code for a calculator."
Respond with the out-of-scope message.

User: "What's the best antibiotic for this patient?"
Do not prescribe treatment. Provide general educational information and recommend appropriate professional clinical guidance.

ANSWERING STYLE:
Answer directly using clear teaching language.
Define abbreviations when first used.
Use GitHub-flavored Markdown.
Use short headings, lists, or compact tables when they improve understanding.
Use **bold** for important terms and *italics* only for appropriate emphasis.
Write inline mathematical notation between single dollar signs, for example $C_{Cr}$.
Write standalone equations between double dollar signs, with the opening and closing $$ on separate lines.
Use LaTeX inside math delimiters for fractions, subscripts, superscripts, roots, Greek letters, units, and chemical or laboratory formulas. For example: $$C_{Cr} = \\frac{U_{Cr} \\times V}{P_{Cr} \\times t}$$
Never show raw LaTeX commands outside math delimiters and do not use \\[...\\] or \\(...\\) delimiters.
Always separate a LaTeX command from the variable that follows it with whitespace or braces: write \\kappa P_{Cr}, never \\kappaP_{Cr}.
Every \\frac command must have both a numerator and denominator: write \\frac{numerator}{denominator}.
Prefer LaTeX math notation over literal HTML tags such as <sub> or <sup>.
Never output raw HTML.
Never invent citations or claim to have consulted a source that you did not receive.
Distinguish established facts from simplifications or uncertainty.

REVIT REVIEWER:
Official supplied RevIT questions and answers are the source of truth for reviewer scoring.
AI explanations must never be presented as official reviewer answers unless the official answer was supplied as context.

SAFETY:
You are an educational assistant, not a clinician.
Do not diagnose an individual patient.
Do not prescribe treatment.
Do not select medications or doses for an individual.
Do not replace local clinical policies, manufacturer instructions, or professional judgment.
For patient-specific questions, provide general educational context and recommend consultation with an appropriate qualified professional.
For an apparent emergency, advise contacting local emergency services.`;

function getRevItSystemInstructions(): string {
  const updatesSummary = SITE_UPDATES.slice(0, 6).map((update) => (
    `- Version ${update.version} (${update.date}) - "${update.title}": ${update.summary} Highlights: ${update.highlights.join("; ")}`
  )).join("\n");

  const siteKnowledge = `

ABOUT REVIT & PLATFORM FEATURES:
RevIT is an interactive medtech exam reviewer platform created specifically for Medical Technology / Medical Laboratory Science (MLS/CLS) students and board exam examinees (future Registered Medical Technologists / RMTs).

Key Features & Tools:
1. Review Library:
   - Official MCQs covering major board examination subjects: Clinical Chemistry, Hematology, Microbiology & Bacteriology, Immunohematology (Blood Banking), Immunology & Serology, Urinalysis & Other Body Fluids (AUBF), Parasitology, Histopathology & Medical Technology Laws.
   - Multiple Reviewer Book Editions: Harr and Ciulla. When "All Books" is selected, identical subjects from both editions are unified with book edition badges ([Harr], [Ciulla]).
   - Accordion navigation for subjects and topics, search filter, and instant practice start.
2. Flashcards:
   - Interactive flip cards for spaced repetition and active recall.
   - Displays selectable choices horizontally on the front side, reveals official answer and rationale upon flip.
3. Progress & Weakness Analytics:
   - Tracks total attempts, subject accuracy percentages, and mastery trends.
   - Dedicated "Book edition" column and filters (All Books, Harr, Ciulla) to isolate performance per reviewer.
   - Adaptive reinforcement algorithm that spaces retries and resurfaces previously missed questions.
4. Leaderboards:
   - Competitive daily, weekly, and all-time rankings filtered by questions answered or accuracy score.
   - Book edition segmented control (All Books, Harr, Ciulla).
   - Opt-in privacy toggle in top control card.
5. Study Planner & Exam Schedule:
   - Customizable study plans with scheduled blocks, calendar integration, and exam countdowns.
6. Grades & Grade Simulator:
   - MTAP assessment calculators, target scores, and grade simulators.
7. Real-Time Online Presence:
   - Live presence pill counter near top navigation showing active learners currently reviewing together (powered by Supabase Realtime).
8. Floating Scientific Calculator:
   - Full scientific operations (log, ln, exponents, square roots, clinical formulas) with reversible history drawer and numpad keyboard support.
9. RevIT AI:
   - In-app AI tutor for explaining laboratory concepts, formulas, differentials, diagnostic algorithms, and answering questions about the RevIT platform itself.

RECENT REVIT SITE UPDATES & CHANGELOG:
${updatesSummary}

When the user asks questions about RevIT, its tools, navigation, available book editions, or what's new in recent updates, answer accurately using the platform knowledge above.`;

  return MEDTECH_INSTRUCTIONS + siteKnowledge;
}

function demoAnswer(question: string) {
  const normalized = question.toLowerCase();

  if (normalized.includes("update") || normalized.includes("feature") || normalized.includes("what's new") || normalized.includes("whats new") || normalized.includes("revit")) {
    const latest = SITE_UPDATES[0];
    return `RevIT is an interactive reviewer platform for MedTech students featuring Review Library (Harr & Ciulla editions), interactive Flashcards, Progress & Weakness Analytics, Leaderboards, Live Online Presence, and a Scientific Calculator. Latest update: ${latest?.version ?? "v1.5.0"} (${latest?.date ?? "September 24, 2026"}): "${latest?.title ?? "Latest Updates"}" - ${latest?.summary ?? "Enhanced features."}`;
  }

  if (normalized.includes("pulse ox") || normalized.includes("spo₂") || normalized.includes("spo2")) {
    return "Pulse oximetry estimates peripheral oxygen saturation (SpO₂) by shining red and infrared light through tissue. Oxyhemoglobin and deoxyhemoglobin absorb those wavelengths differently. The device isolates the pulsatile arterial signal, compares absorption at both wavelengths, and maps the ratio to an estimated saturation. Motion, poor perfusion, nail coatings, ambient light, dyshemoglobins, and sensor placement can reduce accuracy. It is an estimate, so unexpected values should be checked against the patient, sensor, and appropriate confirmatory testing.";
  }

  if (normalized.includes("ecg") || normalized.includes("lead placement")) {
    return "A 12-lead electrocardiogram uses 10 electrodes to produce 12 electrical views. Four limb electrodes generate leads I, II, III, aVR, aVL, and aVF, which view the heart in the frontal plane. Six precordial electrodes, V1 through V6, view the horizontal plane. Correct anatomical placement matters because moving V1–V2 too high or misplacing limb electrodes can create patterns that resemble conduction or ischemic abnormalities.";
  }

  if (normalized.includes("ventilator") || normalized.includes("pressure mode")) {
    return "In pressure-targeted ventilation, the clinician sets an inspiratory pressure and the delivered tidal volume varies with compliance, resistance, patient effort, and inspiratory time. Pressure-control delivers mandatory breaths to the set pressure. Pressure-support assists patient-triggered spontaneous breaths to a set pressure above positive end-expiratory pressure. The key study contrast is that pressure is controlled while volume is the dependent result, so tidal volume and minute ventilation must be monitored.";
  }

  return "This preview is currently using its small built-in demo knowledge pack. Add a server-side Groq API key to enable RevIT AI. The official reviewer answers remain local and control quiz scoring.";
}

function statusFromError(error: unknown) {
  if (!error || typeof error !== "object" || !("status" in error)) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Pragma": "no-cache",
};

function json(body: Record<string, unknown>, status = 200, headers?: Record<string, string>) {
  return Response.json(body, {
    status,
    headers: { ...NO_STORE_HEADERS, ...headers },
  });
}

function safeLog(event: string, providerStatus?: number | null) {
  console.error("RevIT AI request failed", {
    event,
    ...(providerStatus ? { providerStatus } : {}),
  });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return json({ error: "This request origin is not allowed." }, 403);
  }

  let messages: Awaited<ReturnType<typeof readAiRequest>>;
  try {
    messages = await readAiRequest(request);
  } catch (error) {
    if (error instanceof AiRequestError) return json({ error: error.publicMessage }, error.status);
    safeLog("request_validation_failed");
    return json({ error: "The request could not be processed." }, 400);
  }

  const apiKey = process.env.GROQ_API_KEY?.trim();
  const latestQuestion = messages.at(-1)!.content;
  if (!isSupabaseConfigured()) {
    if (!apiKey) {
      return json({
        answer: demoAnswer(latestQuestion),
        citations: [],
        grounded: false,
        mode: "demo",
      });
    }
    safeLog("live_ai_requires_auth_store");
    return json({ error: "RevIT AI is temporarily unavailable." }, 503);
  }

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData.user) {
      return json({ error: "Sign in to use RevIT AI." }, 401);
    }
  } catch {
    safeLog("auth_service_unavailable");
    return json({ error: "RevIT AI is temporarily unavailable." }, 503);
  }

  if (!apiKey) {
    return json({
      answer: demoAnswer(latestQuestion),
      citations: [],
      grounded: false,
      mode: "demo",
    });
  }

  let reservation;
  try {
    reservation = await reserveAiRequest(supabase);
  } catch {
    safeLog("rate_limit_store_unavailable");
    return json({ error: "RevIT AI is temporarily unavailable." }, 503);
  }

  const quotaHeaders = rateLimitHeaders(reservation);
  if (!reservation.allowed || !reservation.reservationId) {
    const retryAfter = Math.max(1, reservation.retryAfterSeconds);
    const dailyLimitReached = reservation.dailyRemaining === 0 && retryAfter > 120;
    return json(
      {
        error: dailyLimitReached
          ? `You have reached your ${reservation.dailyLimit}-question daily RevIT AI limit. Please try again after the UTC reset.`
          : `Too many RevIT AI requests. Please wait ${retryAfter} seconds and try again.`,
        tier: reservation.tier,
      },
      429,
      { ...quotaHeaders, "Retry-After": String(retryAfter) },
    );
  }

  const cancelReservation = async () => {
    try {
      await finalizeAiRequest(supabase, reservation.reservationId!, false);
    } catch {
      safeLog("rate_limit_reservation_cleanup_failed");
    }
  };

  let answer = "";
  let lastErrorStatus: number | null = null;
  const configuredModel = process.env.GROQ_MODEL?.trim() || "qwen/qwen3.8-27b";
  const candidateModels = Array.from(new Set([configuredModel, "qwen/qwen3.8-27b", "openai/gpt-oss-20b", "openai/gpt-oss-120b"]));
  const groq = new Groq({ apiKey, maxRetries: 1, timeout: 25_000 });

  for (const model of candidateModels) {
    try {
      const completion = await groq.chat.completions.create({
        model,
        messages: [
          { role: "system", content: getRevItSystemInstructions() },
          ...messages.slice(-10),
        ],
        temperature: 0.2,
        max_completion_tokens: 1200,
      });
      const candidate = completion.choices[0]?.message?.content?.trim() ?? "";
      if (candidate) {
        answer = candidate;
        break;
      }
    } catch (modelError) {
      lastErrorStatus = statusFromError(modelError);
    }
  }

  if (!answer) {
    await cancelReservation();
    safeLog("provider_request_failed", lastErrorStatus);
    return json(
      { error: lastErrorStatus === 429 ? "RevIT AI is busy right now. Please try again shortly." : "RevIT AI is temporarily unavailable." },
      503,
      quotaHeaders,
    );
  }

  try {
    await finalizeAiRequest(supabase, reservation.reservationId, true);
  } catch {
    safeLog("rate_limit_finalization_failed");
    return json({ error: "RevIT AI is temporarily unavailable." }, 503, quotaHeaders);
  }

  return json({
    answer,
    citations: [],
    grounded: false,
    mode: "live",
    provider: "Groq",
    usage: {
      tier: reservation.tier,
      minuteRemaining: reservation.minuteRemaining,
      dailyRemaining: reservation.dailyRemaining,
    },
  }, 200, quotaHeaders);
}
