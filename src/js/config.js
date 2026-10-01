/* =========================================================
   FitAI Configuration Module
   Handles environment variables, Gemini API keys, and models.
   ========================================================= */

const STORAGE_API_KEY = "fitai_gemini_api_key";

/**
 * Retrieves the Gemini API key.
 * Checks .env file (VITE_GEMINI_API_KEY) first,
 * then falls back to localStorage if set.
 */
export function getGeminiApiKey() {
  // Loaded from .env via Vite
  const envKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (envKey && envKey.trim() && !envKey.includes("your_gemini_api_key")) {
    return envKey.trim();
  }

  const localKey = localStorage.getItem(STORAGE_API_KEY);
  if (localKey && localKey.trim()) {
    return localKey.trim();
  }

  return "";
}

/**
 * Checks if a valid key is configured.
 */
export function hasGeminiApiKey() {
  const key = getGeminiApiKey();
  return Boolean(key && key.length > 5);
}

export const FALLBACK_MODELS = [
  "gemini-flash-latest",
  "gemini-3.7-flash",
  "gemini-3.5-flash",
  "gemini-3.8-flash",
];

/**
 * Returns the Gemini model name (default: gemini-flash-latest).
 */
export function getGeminiModel() {
  return import.meta.env.VITE_GEMINI_MODEL || "gemini-flash-latest";
}

/**
 * Constructs the standard Gemini REST endpoint for generateContent.
 */
export function getGeminiApiUrl(modelName) {
  const model = modelName || getGeminiModel();
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
}

export const CONFIG = {
  get apiKey() {
    return getGeminiApiKey();
  },
  get model() {
    return getGeminiModel();
  },
  get apiUrl() {
    return getGeminiApiUrl();
  },
};
