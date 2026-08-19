type InputMessage = { role: "user" | "assistant"; content: string };

const MEDTECH_INSTRUCTIONS = `You are MedReview AI, an educational medtech tutor for students.

Scope: biomedical devices, diagnostics, medical laboratory science, instrumentation, physiology, quality systems, safety, and study concepts.

Answer the question directly in clear teaching language. Define abbreviations on first use. Use short sections or numbered steps when they improve understanding. Prefer retrieved study-library material when it is available. Never invent a citation or imply that you consulted a source you did not receive. Distinguish established facts from simplifications and uncertainty.

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

  return "This preview is currently using its small built-in demo knowledge pack. Add the server-side Gemini API key to enable the full medtech tutor. Try one of the suggested questions to test the complete chat flow.";
}

function collectGeminiResponse(data: Record<string, unknown>) {
  const text: string[] = [];
  const steps = Array.isArray(data.steps) ? data.steps : [];

  for (const step of steps) {
    if (!step || typeof step !== "object") continue;
    const stepRecord = step as Record<string, unknown>;
    if (stepRecord.type !== "model_output") continue;
    const content = Array.isArray(stepRecord.content)
      ? stepRecord.content
      : [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const record = part as Record<string, unknown>;
      if (record.type === "text" && typeof record.text === "string") {
        text.push(record.text);
      }
    }
  }

  return text.join("\n\n").trim();
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      messages?: unknown;
      previousInteractionId?: unknown;
    };
    if (!validMessages(body.messages)) {
      return Response.json({ error: "Please send a valid question." }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    const latestQuestion = body.messages.at(-1)!.content;
    if (!apiKey) {
      return Response.json({
        answer: demoAnswer(latestQuestion),
        citations: [],
        grounded: false,
        mode: "demo",
      });
    }

    const payload: Record<string, unknown> = {
      model: process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash",
      input: latestQuestion,
      system_instruction: MEDTECH_INSTRUCTIONS,
    };

    if (
      typeof body.previousInteractionId === "string"
      && body.previousInteractionId.trim().length > 0
      && body.previousInteractionId.length <= 1000
    ) {
      payload.previous_interaction_id = body.previousInteractionId.trim();
    }

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error("Gemini request failed");
    const data = await response.json() as Record<string, unknown>;
    const answer = collectGeminiResponse(data);
    if (!answer) throw new Error("Gemini returned an empty answer");

    return Response.json({
      answer,
      citations: [],
      grounded: false,
      mode: "live",
      interactionId: typeof data.id === "string" ? data.id : undefined,
    });
  } catch {
    return Response.json({ error: "The assistant is temporarily unavailable. Please try again." }, { status: 500 });
  }
}
