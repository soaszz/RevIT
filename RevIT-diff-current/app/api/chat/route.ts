import Groq from "groq-sdk";

type InputMessage = { role: "user" | "assistant"; content: string };

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

function validMessages(value: unknown): value is InputMessage[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 12 && value.every((message) => {
    if (!message || typeof message !== "object") return false;
    const candidate = message as Record<string, unknown>;
    return (candidate.role === "user" || candidate.role === "assistant")
      && typeof candidate.content === "string"
      && candidate.content.trim().length > 0
      && candidate.content.length <= 4000;
  });
}

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

export async function POST(request: Request) {
  try {
    const body = await request.json() as { messages?: unknown };
    if (!validMessages(body.messages)) {
      return Response.json({ error: "Please send a valid question." }, { status: 400 });
    }

    const apiKey = process.env.GROQ_API_KEY?.trim();
    const latestQuestion = body.messages.at(-1)!.content;
    if (!apiKey) {
      return Response.json({
        answer: demoAnswer(latestQuestion),
        citations: [],
        grounded: false,
        mode: "demo",
      });
    }

    const groq = new Groq({ apiKey });
    let answer = "";
    try {
      const completion = await groq.chat.completions.create({
        model: process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b",
        messages: [
          { role: "system", content: MEDTECH_INSTRUCTIONS },
          ...body.messages.slice(-10),
        ],
        temperature: 0.2,
        max_completion_tokens: 1200,
      });
      answer = completion.choices[0]?.message?.content?.trim() ?? "";
    } catch (error) {
      const status = statusFromError(error);
      if (status === 429) {
        return Response.json(
          { error: "RevIT AI is temporarily unavailable because its Groq rate limit has been reached." },
          { status: 503 },
        );
      }
      if (status === 401 || status === 403) {
        return Response.json(
          { error: "RevIT AI is not configured with a valid Groq API key." },
          { status: 503 },
        );
      }
      if (status === 404) {
        return Response.json(
          { error: "The configured Groq model is unavailable. Check GROQ_MODEL in the deployment settings." },
          { status: 503 },
        );
      }
      throw error;
    }
    if (!answer) throw new Error("Groq returned an empty answer");

    return Response.json({
      answer,
      citations: [],
      grounded: false,
      mode: "live",
      provider: "Groq",
    });
  } catch (error) {
    console.error("RevIT assistant error", error);
    return Response.json({ error: "The assistant is temporarily unavailable. Please try again." }, { status: 500 });
  }
}
