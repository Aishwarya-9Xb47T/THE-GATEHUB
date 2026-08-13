import fs from "fs";
import path from "path";
import type { AiProviderId } from "./providers/AIProvider.js";

export interface AiRuntimeConfig {
  provider: AiProviderId;
  model: string;
  ollamaHost: string;
  temperature: number;
  topP: number;
  topK: number;
  maxTokens: number;
  timeoutMs: number;
  streamingEnabled: boolean;
  azureEndpoint?: string;
  azureDeployment?: string;
}

const CONFIG_PATH = path.join(process.cwd(), "data", "ai-provider-config.json");

const DEFAULTS: AiRuntimeConfig = {
  provider: (process.env.AI_PROVIDER as AiProviderId) || "ollama",
  model: process.env.OLLAMA_MODEL || process.env.OPENAI_MODEL || "llama3.1",
  ollamaHost: process.env.OLLAMA_HOST || "http://localhost:11434",
  temperature: Number(process.env.AI_TEMPERATURE || 0.7),
  topP: Number(process.env.AI_TOP_P || 0.9),
  topK: Number(process.env.AI_TOP_K || 40),
  maxTokens: Number(process.env.AI_MAX_TOKENS || 4096),
  timeoutMs: Number(process.env.AI_TIMEOUT_MS || 120000),
  streamingEnabled: process.env.AI_STREAMING !== "false",
  azureEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
  azureDeployment: process.env.AZURE_OPENAI_DEPLOYMENT,
};

let runtime: AiRuntimeConfig = { ...DEFAULTS };
let detectedOllamaModels: string[] = [];
let ollamaHealthy = false;
let activeProviderNote = "";

export function getAiRuntimeConfig(): AiRuntimeConfig {
  return { ...runtime };
}

export function setAiRuntimeConfig(patch: Partial<AiRuntimeConfig>) {
  runtime = { ...runtime, ...patch };
  persist();
}

export function setOllamaDetection(healthy: boolean, models: string[]) {
  ollamaHealthy = healthy;
  detectedOllamaModels = models;
}

export function getOllamaDetection() {
  return { healthy: ollamaHealthy, models: [...detectedOllamaModels] };
}

export function setActiveProviderNote(note: string) {
  activeProviderNote = note;
}

export function getActiveProviderNote() {
  return activeProviderNote;
}

function persist() {
  try {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(runtime, null, 2));
  } catch {
    /* non-fatal */
  }
}

export function loadAiRuntimeConfigFromDisk() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) as Partial<AiRuntimeConfig>;
      runtime = { ...DEFAULTS, ...parsed };
    }
  } catch {
    runtime = { ...DEFAULTS };
  }
}

export async function mergePlatformAiSettings(aiProvider?: string | null, aiModelName?: string | null) {
  if (aiProvider && ["ollama", "openai", "gemini", "claude", "azure_openai", "mock"].includes(aiProvider)) {
    runtime.provider = aiProvider as AiProviderId;
  }
  if (aiModelName?.trim()) runtime.model = aiModelName.trim();
}
