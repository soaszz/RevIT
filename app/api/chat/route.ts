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

  return "This preview is currently using its small built-in demo knowledge pack. Add the server-side OpenAI API key to enable the full medtech tutor, and connect an approved study library to ground answers in your own references. Try one of the suggested questions to test the complete chat flow.";
}

function collectResponse(data: Record<string, unknown>) {
  const text: string[] = [];
  const citations = new Set<string>();
  const output = Array.isArray(data.output) ? data.output : [];

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as { content?: unknown }).content)
      ? (item as { content: unknown[] }).content
      : [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const record = part as Record<string, unknown>;
      if (record.type === "output_text" && typeof record.text === "string") text.push(record.text);
      const annotations = Array.isArray(record.annotations) ? record.annotations : [];
      for (const annotation of annotations) {
        if (!annotation || typeof annotation !== "object") continue;
        const citation = annotation as Record<string, unknown>;
        if (citation.type === "file_citation" && typeof citation.filename === "string") {
          citations.add(citation.filename);
        }
      }
    }
  }

  return { answer: text.join("\n\n").trim(), citations: [...citations] };
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { messages?: unknown; safetyId?: unknown };
    if (!validMessages(body.messages)) {
      return Response.json({ error: "Please send a valid question." }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    const latestQuestion = body.messages.at(-1)!.content;
    if (!apiKey) {
      return Response.json({
        answer: demoAnswer(latestQuestion),
        citations: [],
        grounded: false,
        mode: "demo",
      });
    }

    const moderationResponse = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "omni-moderation-latest", input: latestQuestion }),
    });
    if (!moderationResponse.ok) throw new Error("Moderation request failed");
    const moderation = await moderationResponse.json() as { results?: Array<{ flagged?: boolean }> };
    if (moderation.results?.[0]?.flagged) {
      return Response.json({ error: "I can’t help with that request. Try asking for a safe, educational explanation instead." }, { status: 400 });
    }

    const vectorStoreId = process.env.OPENAI_VECTOR_STORE_ID?.trim();
    const payload: Record<string, unknown> = {
      model: process.env.OPENAI_MODEL?.trim() || "gpt-5.6-terra",
      instructions: MEDTECH_INSTRUCTIONS,
      input: body.messages.slice(-10),
      reasoning: { effort: "medium" },
      text: { verbosity: "medium" },
      store: false,
    };

    if (typeof body.safetyId === "string" && body.safetyId.length <= 100) {
      payload.safety_identifier = body.safetyId;
    }
    if (vectorStoreId) {
      payload.tools = [{ type: "file_search", vector_store_ids: [vectorStoreId], max_num_results: 6 }];
      payload.include = ["file_search_call.results"];
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error("Model request failed");
    const data = await response.json() as Record<string, unknown>;
    const result = collectResponse(data);
    if (!result.answer) throw new Error("The model returned an empty answer");

    return Response.json({
      ...result,
      grounded: Boolean(vectorStoreId && result.citations.length),
      mode: "live",
    });
  } catch {
    return Response.json({ error: "The assistant is temporarily unavailable. Please try again." }, { status: 500 });
  }
}
