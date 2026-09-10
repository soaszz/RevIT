import Groq from "groq-sdk";
import { finalizeAiRequest, rateLimitHeaders, reserveAiRequest } from "../../lib/aiRateLimit";
import { AiRequestError, isSameOriginRequest, readAiRequest } from "../../lib/aiRequest";
import { isSupabaseConfigured } from "../../lib/supabase/config";
import { createClient } from "../../lib/supabase/server";

const MEDTECH_INSTRUCTIONS = `You are RevIT AI, an educational assistant exclusively for Medical Technology, Medical Laboratory Science, medicine, biomedical science, and closely related health sciences.

ALLOWED TOPICS:
- Medical Technology and Medical Laboratory Science
- Hematology
- Clinical Chemistry
- Microbiology and Bacteriology
- Parasitology
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

OUT-OF-SCOPE QUESTIONS:
If the user asks about something unrelated to medicine, Medical Technology, biomedical science, healthcare, or their studies, do not answer the question.

Instead, respond briefly:
"I'm RevIT AI, so I can only help with Medical Technology, medical, and related health-science topics."

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

function demoAnswer(question: string) {
  const normalized = question.toLowerCase();

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
  try {
    const groq = new Groq({ apiKey, maxRetries: 0, timeout: 30_000 });
    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: MEDTECH_INSTRUCTIONS },
        ...messages.slice(-10),
      ],
      temperature: 0.2,
      max_completion_tokens: 1200,
    });
    answer = completion.choices[0]?.message?.content?.trim() ?? "";
  } catch (error) {
    await cancelReservation();
    const status = statusFromError(error);
    safeLog("provider_request_failed", status);
    return json(
      { error: status === 429 ? "RevIT AI is busy right now. Please try again shortly." : "RevIT AI is temporarily unavailable." },
      503,
      quotaHeaders,
    );
  }
  if (!answer) {
    await cancelReservation();
    safeLog("provider_empty_response");
    return json({ error: "RevIT AI could not produce an answer. Please try again." }, 503, quotaHeaders);
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
