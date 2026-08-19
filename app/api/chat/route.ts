import Groq from "groq-sdk";

type InputMessage = { role: "user" | "assistant"; content: string };

const MEDTECH_INSTRUCTIONS = `You are RevIT AI, an educational medtech tutor for students.

Scope: biomedical devices, diagnostics, medical laboratory science, instrumentation, physiology, quality systems, safety, and study concepts.

Answer the question directly in clear teaching language. Define abbreviations on first use. Use GitHub-flavored Markdown. Use short headings, lists, or compact tables when they improve understanding, and never output raw HTML. Never invent a citation or imply that you consulted a source you did not receive. Distinguish established facts from simplifications and uncertainty. Official supplied answers remain the source of truth for RevIT reviewer scoring; AI explanations must not be presented as official reviewer answers.

You are not a clinician and must not diagnose a person, prescribe treatment, choose a medication or dose, or replace local clinical policy, manufacturer instructions for use, or professional judgment. For patient-specific questions, give only general educational context and direct the user to a qualified professional. If the question suggests an immediate emergency, advise contacting local emergency services. Do not use alarmist language for ordinary study questions.`;

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
