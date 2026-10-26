const GROQ_API_KEY = import.meta.env["VITE_GROQ_API_KEY"];
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// llama-3.1-8b-instant is no longer available on this key (Groq returned 404 model_not_found)
const GROQ_MODEL = "qwen/qwen3.8-27b";

// Models sometimes wrap JSON in ```json fences or add a stray sentence — keep only the outermost {...}.
function parseModelJson(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return JSON.parse(start !== -1 && end > start ? text.slice(start, end + 1) : text);
}

export interface GroqAssessment {
  probability: number; // 0-100
  assessment: string; // 1-sentence military assessment
}

export async function getGroqAssessment(
  droneId: string,
  zoneName: string,
  speed: number,
  altitude: number,
  friendly: boolean,
  etaSeconds: number,
): Promise<GroqAssessment> {
  const systemPrompt = `You are a military AI threat assessment system for airspace monitoring.
Respond ONLY with valid JSON in this exact format: {"probability": <number 0-100>, "assessment": "<one sentence>"}
No other text. The probability should reflect how likely the entity is to breach the restricted zone.
For friendly units, probability should be 0-20 and assessment should say to stand down.
For hostile/unknown units, probability should be 60-95 and assessment should recommend intercept.`;

  const userPrompt = friendly
    ? `Friendly unit ${droneId} is approaching Zone ${zoneName}. Speed: ${speed} km/h, Altitude: ${altitude}m, ETA: ${etaSeconds}s. It is a verified allied drone. Assess.`
    : `Unknown drone ${droneId} is on collision course with restricted Zone ${zoneName}. Speed: ${speed} km/h, Altitude: ${altitude}m, ETA: ${etaSeconds}s. Assess threat level.`;

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 100,
      }),
    });
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? '{"probability": 75, "assessment": "Threat assessment unavailable."}';
    return parseModelJson(text);
  } catch {
    return {
      probability: friendly ? 10 : 75,
      assessment: friendly
        ? "Friendly unit in corridor — clearance verified, stand down."
        : "Unknown entity on breach vector — intercept recommended.",
    };
  }
}

export async function generateIntelligenceReport(
  drones: Array<{
    id: string;
    x: number;
    y: number;
    speed: number;
    heading: number;
    threat: string;
    friendly?: boolean | undefined;
  }>,
  recentBreaches: Array<{ droneId: string; zoneName: string; time: string }>
): Promise<{ situation: string; assessment: string; recommendation: string; confidence: number; error?: string | undefined }> {
  const apiKey = import.meta.env["VITE_GROQ_API_KEY"];
  console.log('[Groq] API key present:', !!apiKey, '| length:', apiKey?.length ?? 0);
  if (!apiKey) {
    return {
      situation: 'VITE_GROQ_API_KEY not set in .env file.',
      assessment: 'Add the key and restart the dev server.',
      recommendation: 'Run: echo "VITE_GROQ_API_KEY=your_key" >> .env then npm run dev',
      confidence: 0
    };
  }

  const dronesSummary = drones.map(d =>
    `${d.id} (${d.friendly ? 'FRIENDLY' : 'HOSTILE'}): pos ${d.x.toFixed(1)}%,${d.y.toFixed(1)}% heading ${d.heading}° speed ${d.speed} km/h threat=${d.threat}`
  ).join('\n');

  const breachSummary = recentBreaches.length > 0
    ? recentBreaches.map(b => `${b.droneId} breached Zone ${b.zoneName} at ${b.time}`).join('\n')
    : 'No recent breach events.';

  const prompt = `You are SKYAI, a military counter-UAS tactical AI analyst for Airspace Sector 7. Generate a classified intelligence report based on current drone tracking data.

CURRENT TRACKS:
${dronesSummary}

RECENT BREACH EVENTS:
${breachSummary}

Respond ONLY with valid JSON in this exact format:
{
  "situation": "2-3 sentence factual summary of current airspace picture",
  "assessment": "2-3 sentence threat assessment and most probable course of action",
  "recommendation": "2-3 sentence tactical recommendation for ground personnel",
  "confidence": <integer 60-95>
}

Be specific, military-style, terse. Reference actual drone IDs and zone names from the data. Do NOT use placeholder text.`;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: 'You are a military AI analyst. Always respond with valid JSON only, no markdown, no extra text.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.4,
        max_tokens: 800,
        response_format: { type: 'json_object' }
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[Groq] HTTP', res.status, errText);
      throw new Error(`Groq ${res.status}: ${errText}`);
    }
    const data = await res.json();
    const text = data.choices[0]?.message?.content ?? '';
    let parsed;
    try {
      parsed = parseModelJson(text);
    } catch {
      throw new Error(`Groq returned non-JSON content: ${text.slice(0, 300)}`);
    }
    return {
      situation: parsed.situation ?? '',
      assessment: parsed.assessment ?? '',
      recommendation: parsed.recommendation ?? '',
      confidence: parsed.confidence ?? 72
    };
  } catch (err) {
    console.error('Groq generateIntelligenceReport error:', err);
    return {
      situation: 'Unable to generate situation report at this time. Manual assessment required.',
      assessment: 'AI assessment unavailable. Escalate to human analyst.',
      recommendation: 'Maintain current posture. Request manual intelligence cycle.',
      confidence: 0,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}
