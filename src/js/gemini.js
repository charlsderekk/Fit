/* =========================================================
   FitAI — Gemini API Service
   Official Google Gemini REST API integration with support for:
   - Structured JSON output (Plans, Adaptations, Calories)
   - Multi-turn Conversational Coach Chat
   - Clean error handling with helpful diagnostics (401, 429, etc.)
   ========================================================= */

import { getGeminiApiKey, getGeminiModel, getGeminiApiUrl } from "./config.js";

/* =========================================================
   SCHEMAS FOR STRUCTURED OUTPUT
   ========================================================= */

export const PLAN_SCHEMA = {
  type: "object",
  properties: {
    overview: { type: "string" },
    weeklySplit: {
      type: "array",
      items: { type: "string" },
    },
    days: {
      type: "array",
      items: {
        type: "object",
        properties: {
          day: { type: "string" },
          focus: { type: "string" },
          exercises: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                sets: { type: "integer" },
                reps: { type: "string" },
              },
              required: ["name", "sets", "reps"],
            },
          },
        },
        required: ["day", "focus", "exercises"],
      },
    },
    nutrition: {
      type: "object",
      properties: {
        dailyCalories: { type: "integer" },
        proteinG: { type: "integer" },
        carbsG: { type: "integer" },
        fatG: { type: "integer" },
        mealIdeas: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["dailyCalories", "proteinG", "carbsG", "fatG", "mealIdeas"],
    },
    notes: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["overview", "weeklySplit", "days", "nutrition", "notes"],
};

export const ADAPTIVE_PLAN_SCHEMA = {
  type: "object",
  properties: {
    overview: { type: "string" },
    whatChanged: { type: "string" },
    weeklySplit: {
      type: "array",
      items: { type: "string" },
    },
    days: {
      type: "array",
      items: {
        type: "object",
        properties: {
          day: { type: "string" },
          focus: { type: "string" },
          exercises: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                sets: { type: "integer" },
                reps: { type: "string" },
              },
              required: ["name", "sets", "reps"],
            },
          },
        },
        required: ["day", "focus", "exercises"],
      },
    },
    nutrition: {
      type: "object",
      properties: {
        dailyCalories: { type: "integer" },
        proteinG: { type: "integer" },
        carbsG: { type: "integer" },
        fatG: { type: "integer" },
        mealIdeas: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["dailyCalories", "proteinG", "carbsG", "fatG", "mealIdeas"],
    },
    notes: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "overview",
    "whatChanged",
    "weeklySplit",
    "days",
    "nutrition",
    "notes",
  ],
};

export const CALORIE_SCHEMA = {
  type: "object",
  properties: {
    foodName: { type: "string" },
    calories: { type: "integer" },
    proteinG: { type: "integer" },
    carbsG: { type: "integer" },
    fatG: { type: "integer" },
  },
  required: ["foodName", "calories", "proteinG", "carbsG", "fatG"],
};

/* =========================================================
   CORE GEMINI API CALL (Official v1beta API)
   ========================================================= */

export async function callGemini({
  contents,
  systemInstruction,
  jsonMode = false,
  responseSchema = null,
}) {
  const apiKey = getGeminiApiKey();

  if (!apiKey || apiKey.trim().length < 10) {
    const err = new Error(
      "No Gemini API key found. Open your .env file and set VITE_GEMINI_API_KEY to the key from https://aistudio.google.com/app/apikey."
    );
    err.isAuthError = true;
    throw err;
  }

  const model = getGeminiModel();
  const endpoint = `${getGeminiApiUrl(model)}?key=${encodeURIComponent(apiKey)}`;

  // Format and sanitize contents for Gemini API
  // Gemini expects: [{ role: "user" | "model", parts: [{ text: "..." }] }]
  const formattedContents = [];
  let lastRole = null;

  for (const item of contents) {
    const role = item.role === "model" ? "model" : "user";
    let text = "";

    if (Array.isArray(item.parts)) {
      text = item.parts.map((p) => (typeof p === "string" ? p : p.text || "")).join("\n");
    } else if (typeof item.text === "string") {
      text = item.text;
    } else if (typeof item.content === "string") {
      text = item.content;
    }

    if (!text.trim()) continue;

    // Prevent consecutive identical roles in Gemini multi-turn
    if (formattedContents.length > 0 && lastRole === role) {
      formattedContents[formattedContents.length - 1].parts[0].text += `\n\n${text}`;
    } else {
      formattedContents.push({
        role,
        parts: [{ text }],
      });
      lastRole = role;
    }
  }

  // Ensure first turn is 'user'
  if (formattedContents.length > 0 && formattedContents[0].role !== "user") {
    formattedContents.unshift({
      role: "user",
      parts: [{ text: "Hello" }],
    });
  }

  if (formattedContents.length === 0) {
    throw new Error("Cannot send empty prompt to Gemini.");
  }

  // Build standard Gemini request body
  const requestBody = {
    contents: formattedContents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4000,
    },
  };

  if (systemInstruction) {
    requestBody.systemInstruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  if (jsonMode) {
    requestBody.generationConfig.responseMimeType = "application/json";
    if (responseSchema) {
      requestBody.generationConfig.responseSchema = responseSchema;
    }
  }

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });
  } catch (netErr) {
    throw new Error(
      `Network connection failed: ${netErr.message}. Check your internet connection.`
    );
  }

  const data = await response.json().catch(() => null);

  // Robust error handling for 401, 403, 429, etc.
  if (!response.ok) {
    const status = response.status;
    const errorDetails = data?.error?.message || data?.message || "Unknown error";

    if (
      status === 401 ||
      status === 403 ||
      errorDetails.includes("API key not valid") ||
      errorDetails.includes("UNAUTHENTICATED") ||
      errorDetails.includes("PERMISSION_DENIED")
    ) {
      const authErr = new Error(
        `Gemini API Key rejected (Request failed with ${status}): ${errorDetails}.\n\nPlease ensure you pasted a valid key from https://aistudio.google.com/app/apikey into your .env file or Settings modal.`
      );
      authErr.isAuthError = true;
      throw authErr;
    }

    if (status === 429 || errorDetails.includes("RESOURCE_EXHAUSTED")) {
      throw new Error(
        "Gemini rate limit / quota exceeded. Please wait a moment and try again, or check your quota at https://aistudio.google.com"
      );
    }

    if (status === 404) {
      throw new Error(
        `Gemini API returned 404 for model "${model}": ${errorDetails}\n\n` +
        `Check that the model is currently available for the Gemini API and your project. ` +
        `The current model setting is VITE_GEMINI_MODEL=${model}.\n\n` +
        `• Verify your key at https://aistudio.google.com/app/apikey\n` +
        `• Make sure the key's project has access to the Gemini API\n` +
        `• Try VITE_GEMINI_MODEL=gemini-3.8-flash in your .env file`
      );
    }

    throw new Error(`Gemini API Error (${status}): ${errorDetails}`);
  }

  // Extract candidate response text
  const candidate = data?.candidates?.[0];
  if (candidate?.finishReason === "SAFETY") {
    throw new Error("The AI response was blocked by safety filters. Please refine the query.");
  }

  const outputText = candidate?.content?.parts
    ?.map((part) => part.text || "")
    .join("");

  if (outputText && outputText.trim()) {
    return outputText.trim();
  }

  throw new Error("The AI returned an empty response. Please try again.");
}

/* =========================================================
   JSON GENERATOR & PARSER
   ========================================================= */

export async function generateJSON(promptText, systemInstruction) {
  let schema = PLAN_SCHEMA;

  if (
    promptText.includes("food/meal description") ||
    promptText.includes('"foodName"') ||
    promptText.includes("nutritional content")
  ) {
    schema = CALORIE_SCHEMA;
  } else if (
    promptText.includes("whatChanged") ||
    promptText.includes("reviewing a client's progress")
  ) {
    schema = ADAPTIVE_PLAN_SCHEMA;
  }

  const raw = await callGemini({
    contents: [
      {
        role: "user",
        parts: [{ text: promptText }],
      },
    ],
    systemInstruction,
    jsonMode: true,
    responseSchema: schema,
  });

  // Clean Markdown wrappers like ```json ... ```
  let cleaned = String(raw || "").trim();
  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  // Try direct parse
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try extracting from outermost braces
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const possibleJSON = cleaned.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(possibleJSON);
      } catch (err) {
        console.error("JSON parse failed on substring:", possibleJSON, err);
      }
    }
  }

  console.error("Raw unparseable response:", raw);
  throw new Error("The AI returned an invalid JSON response. Please try generating again.");
}

/* =========================================================
   COACH CHAT
   ========================================================= */

export async function generateChatReply(history, systemInstruction) {
  const contents = history.map((message) => ({
    role: message.role === "model" ? "model" : "user",
    parts: [{ text: message.text || message.content || "" }],
  }));

  return callGemini({
    contents,
    systemInstruction,
    jsonMode: false,
  });
}

/* =========================================================
   PROMPT BUILDERS
   ========================================================= */

export function profileSummaryLine(p) {
  const target = p.targetWeight ? `, target weight ${p.targetWeight} kg` : "";
  const limitations = p.limitations
    ? `Injuries/limitations: ${p.limitations}.`
    : "No reported injuries.";

  return `${p.age}-year-old, ${p.sex}, ${p.height} cm, ${p.weight} kg${target}. Goal: ${p.goal}. Experience: ${p.experience}. Available ${p.days} days/week. Equipment: ${p.equipment}. Diet preference: ${p.diet}. ${limitations}`;
}

export function buildInitialPlanPrompt(profile) {
  return `You are FitAI, an experienced and safety-conscious personal trainer and nutrition coach.
Create a personalized workout and nutrition plan.

CLIENT PROFILE:
${profileSummaryLine(profile)}

REQUIREMENTS:
- Create exactly ${profile.days} training days.
- Consider age, sex, height, weight, target weight, fitness goal, experience, available gym days, equipment, diet preference, and any injuries or limitations.
- Match exercises to the person's experience and equipment.
- Nutrition targets should be realistic, safe, and sustainable.
- Return ONLY valid JSON matching the schema.`;
}

export function buildAdaptivePlanPrompt(profile, previousPlan, progressSummary) {
  return `You are FitAI, an experienced personal trainer reviewing a client's progress.

CLIENT PROFILE:
${profileSummaryLine(profile)}

CURRENT PLAN:
${previousPlan.overview || "Standard routine"}

PROGRESS:
${progressSummary}

Create an updated workout and nutrition plan tailored to the client's progress.
Explain what changed using the "whatChanged" field.
Return ONLY valid JSON matching the schema.`;
}

export function buildCalorieEstimatePrompt(description) {
  return `You are FitAI's food tracking assistant.
Estimate the nutritional content of this food or meal:
"${description}"

Use a realistic estimate based on a typical serving if the amount is not specified.
Return ONLY valid JSON matching the calorie schema with numbers for calories, proteinG, carbsG, fatG.`;
}

export function buildChatSystemInstruction(profile, contextSummary) {
  const profileLine = profile
    ? profileSummaryLine(profile)
    : "User has not completed profile yet.";

  return `You are FitAI, an encouraging, professional, and knowledgeable fitness and nutrition coach inside the FitAI application.
Speak directly to the user in a friendly, clear, practical, and motivating tone.

CLIENT PROFILE:
${profileLine}

CURRENT APP CONTEXT:
${contextSummary}

GUIDELINES:
- Keep answers concise, actionable, and structured (use bullet points when listing exercises).
- Help with workouts, form, sets, reps, nutrition, macros, motivation, and recovery.
- Do not recommend extreme or unsafe diets.
- For injuries or medical issues, advise consulting a qualified healthcare professional.`;
}
