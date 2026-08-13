import fs from "fs";
import path from "path";
import OpenAI from "openai";
import type { AiProviderId } from "./providers/AIProvider.js";
import { getAiRuntimeConfig, setAiRuntimeConfig } from "./AiRuntimeConfig.js";
import { getOllamaDetection } from "./AiRuntimeConfig.js";
import { pickOllamaModel } from "./ollamaClient.js";
import { mapOpenAiError } from "../assessmentStudio/aiAssessment/ErrorMapper.js";
import { AiServiceError } from "../assessmentStudio/aiAssessment/ApiError.js";

export interface ProviderModelConfig {
  primary: string;
  fallback: string;
  reasoning: string;
  embedding: string;
}

export interface ModelCheckResult {
  id: string;
  role: "primary" | "fallback" | "reasoning" | "embedding" | "safe";
  available: boolean;
  reason?: string;
}

export interface ModelResolution {
  configuredModel: string;
  activeModel: string;
  fallbackUsed: boolean;
  retryCount: number;
  jobId?: string;
  durationMs?: number;
}

export interface AiModelHealth {
  provider: AiProviderId;
  configuredModel: string;
  activeModel: string;
  fallbackModel: string;
  fallbackUsed: boolean;
  apiReachable: boolean;
  authentication: "ok" | "invalid" | "missing" | "unknown";
  latencyMs?: number;
  lastError?: string;
  availableModels: string[];
  checks: ModelCheckResult[];
}

const SAFE_MODELS_PATH = path.join(process.cwd(), "data", "ai-safe-models.json");

let lastResolution: ModelResolution | null = null;
let modelHealth: AiModelHealth | null = null;
let openAiAvailableCache: { models: string[]; at: number } | null = null;
const OPENAI_CACHE_MS = 5 * 60 * 1000;

function readSafeModels(): Record<string, string[]> {
  const fromEnv = process.env.OPENAI_SAFE_MODELS?.split(",").map((s) => s.trim()).filter(Boolean);
  try {
    if (fs.existsSync(SAFE_MODELS_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(SAFE_MODELS_PATH, "utf8")) as Record<string, string[]>;
      if (fromEnv?.length) parsed.openai = [...new Set([...fromEnv, ...(parsed.openai || [])])];
      return parsed;
    }
  } catch {
    /* use defaults */
  }
  return {
    openai: fromEnv?.length ? fromEnv : ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"],
    ollama: ["llama3.1", "llama3.2", "qwen2.5", "mistral", "phi3"],
  };
}

export function getProviderModelConfig(provider: AiProviderId): ProviderModelConfig {
  const cfg = getAiRuntimeConfig();
  switch (provider) {
    case "openai":
    case "azure_openai":
      return {
        primary: cfg.model || process.env.OPENAI_MODEL || "gpt-4o-mini",
        fallback: process.env.OPENAI_FALLBACK_MODEL || "gpt-4o-mini",
        reasoning: process.env.OPENAI_REASONING_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
        embedding: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
      };
    case "ollama":
      return {
        primary: cfg.model || process.env.OLLAMA_MODEL || "llama3.1",
        fallback: process.env.OLLAMA_FALLBACK_MODEL || cfg.model || "llama3.1",
        reasoning: process.env.OLLAMA_REASONING_MODEL || cfg.model || "llama3.1",
        embedding: process.env.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text",
      };
    default:
      return {
        primary: cfg.model || "gpt-4o-mini",
        fallback: process.env.OPENAI_FALLBACK_MODEL || "gpt-4o-mini",
        reasoning: cfg.model || "gpt-4o-mini",
        embedding: "text-embedding-3-small",
      };
  }
}

export function buildModelChain(provider: AiProviderId, requested?: string): string[] {
  const mc = getProviderModelConfig(provider);
  const safe = readSafeModels()[provider] || readSafeModels().openai || [];
  const primary = requested || mc.primary;
  const chain = [primary, mc.fallback, ...safe].filter(Boolean);
  return [...new Set(chain)];
}

export function getLastModelResolution(): ModelResolution | null {
  return lastResolution;
}

export function getModelHealth(): AiModelHealth | null {
  return modelHealth;
}

export function logModelEvent(event: {
  configuredModel: string;
  activeModel: string;
  fallbackTriggered: boolean;
  retryCount: number;
  durationMs?: number;
  jobId?: string;
}) {
  const payload = {
    configuredModel: event.configuredModel,
    activeModel: event.activeModel,
    fallbackTriggered: event.fallbackTriggered,
    retryCount: event.retryCount,
    durationMs: event.durationMs,
    jobId: event.jobId,
  };
  console.log("[ai-model]", JSON.stringify(payload));
  if (process.env.NODE_ENV !== "production" || process.env.AI_DEV_LOGS === "true") {
    if (event.fallbackTriggered) {
      console.log(
        `[ai-model] Configured Model: ${event.configuredModel}\nUnavailable\nSwitching to\n${event.activeModel}\nGeneration Started`
      );
    }
  }
}

function isModelNotFound(err: unknown): boolean {
  if (err instanceof AiServiceError && err.payload.type === "MODEL_NOT_FOUND") return true;
  if (err instanceof OpenAI.APIError && err.status === 404) return true;
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    msg.includes("model") &&
    (msg.includes("not found") || msg.includes("does not exist") || msg.includes("not_found"))
  );
}

async function fetchOpenAiModelIds(client: OpenAI): Promise<string[]> {
  const now = Date.now();
  if (openAiAvailableCache && now - openAiAvailableCache.at < OPENAI_CACHE_MS) {
    return openAiAvailableCache.models;
  }
  const ids: string[] = [];
  try {
    for await (const m of client.models.list()) {
      if (m.id) ids.push(m.id);
    }
    openAiAvailableCache = { models: ids, at: now };
  } catch {
    /* list may fail — probing will be used */
  }
  return ids;
}

function resolveOllamaChain(requested: string): string[] {
  const detection = getOllamaDetection();
  const available = detection.models;
  const chain = buildModelChain("ollama", requested);
  if (!available.length) return chain;
  const ordered: string[] = [];
  for (const m of chain) {
    const hit = available.find((a) => a === m || a.startsWith(`${m}:`));
    if (hit) ordered.push(hit);
  }
  for (const a of available) {
    if (!ordered.includes(a)) ordered.push(a);
  }
  return ordered.length ? ordered : chain;
}

export async function validateModelsOnStartup(provider: AiProviderId): Promise<void> {
  const mc = getProviderModelConfig(provider);
  const cfg = getAiRuntimeConfig();
  let activeModel = mc.primary;
  let fallbackUsed = false;
  let apiReachable = false;
  let authentication: AiModelHealth["authentication"] = "unknown";
  let latencyMs: number | undefined;
  let lastError: string | undefined;
  let availableModels: string[] = [];
  const checks: ModelCheckResult[] = [];

  if (provider === "openai" || provider === "azure_openai") {
    const key = process.env.OPENAI_API_KEY || process.env.AZURE_OPENAI_API_KEY;
    if (!key) {
      authentication = "missing";
      lastError = "OPENAI_API_KEY not set";
      modelHealth = {
        provider,
        configuredModel: mc.primary,
        activeModel: mc.fallback,
        fallbackModel: mc.fallback,
        fallbackUsed: true,
        apiReachable: false,
        authentication,
        lastError,
        availableModels: [],
        checks: [{ id: mc.primary, role: "primary", available: false, reason: lastError }],
      };
      return;
    }

    const client = new OpenAI({ apiKey: key });
    const start = Date.now();
    try {
      availableModels = await fetchOpenAiModelIds(client);
      apiReachable = true;
      authentication = "ok";
      latencyMs = Date.now() - start;

      const chain = buildModelChain(provider, mc.primary);
      for (const model of chain) {
        const inList = !availableModels.length || availableModels.includes(model);
        checks.push({
          id: model,
          role: model === mc.primary ? "primary" : model === mc.fallback ? "fallback" : "safe",
          available: inList,
          reason: inList ? undefined : "Not in API model list",
        });
        if (inList) {
          activeModel = model;
          fallbackUsed = model !== mc.primary;
          break;
        }
      }

      if (activeModel === mc.primary && availableModels.length && !availableModels.includes(mc.primary)) {
        const safeHit = chain.find((m) => availableModels.includes(m) && m !== mc.primary);
        if (safeHit) {
          activeModel = safeHit;
          fallbackUsed = true;
          setAiRuntimeConfig({ model: safeHit });
        }
      }
    } catch (err) {
      const mapped = mapOpenAiError(err);
      lastError = mapped.payload.message;
      if (mapped.payload.type === "INVALID_API_KEY") authentication = "invalid";
      apiReachable = mapped.payload.type !== "NETWORK_ERROR";
    }
  } else if (provider === "ollama") {
    const chain = resolveOllamaChain(mc.primary);
    availableModels = getOllamaDetection().models;
    apiReachable = getOllamaDetection().healthy;
    for (const model of chain) {
      const ok = availableModels.some((m) => m === model || m.startsWith(`${model}:`));
      checks.push({
        id: model,
        role: model === mc.primary ? "primary" : "safe",
        available: ok,
        reason: ok ? undefined : "Not installed locally",
      });
      if (ok) {
        activeModel = pickOllamaModel(model, availableModels);
        fallbackUsed = activeModel !== mc.primary && !availableModels.includes(mc.primary);
        break;
      }
    }
    if (!apiReachable) lastError = "Ollama server unreachable";
  } else {
    activeModel = cfg.model;
    apiReachable = true;
    authentication = "ok";
  }

  if (fallbackUsed && activeModel !== mc.primary) {
    setAiRuntimeConfig({ model: activeModel });
    logModelEvent({
      configuredModel: mc.primary,
      activeModel,
      fallbackTriggered: true,
      retryCount: 0,
    });
  }

  lastResolution = {
    configuredModel: mc.primary,
    activeModel,
    fallbackUsed,
    retryCount: 0,
  };

  modelHealth = {
    provider,
    configuredModel: mc.primary,
    activeModel,
    fallbackModel: mc.fallback,
    fallbackUsed,
    apiReachable,
    authentication,
    latencyMs,
    lastError,
    availableModels,
    checks,
  };
}

export type OpenAiCompleteFn = (
  model: string
) => Promise<{ content: string; tokens?: number }>;

export async function completeWithModelFallback(params: {
  provider: AiProviderId;
  requestedModel?: string;
  jobId?: string;
  complete: OpenAiCompleteFn;
}): Promise<{ content: string; tokens?: number; model: string; resolution: ModelResolution }> {
  const mc = getProviderModelConfig(params.provider);
  const configured = params.requestedModel || mc.primary;
  const chain =
    params.provider === "ollama"
      ? resolveOllamaChain(configured)
      : buildModelChain(params.provider, configured);

  let retryCount = 0;
  let lastErr: unknown;

  for (const model of chain) {
    const start = Date.now();
    try {
      const res = await params.complete(model);
      const resolution: ModelResolution = {
        configuredModel: configured,
        activeModel: model,
        fallbackUsed: model !== configured,
        retryCount,
        jobId: params.jobId,
        durationMs: Date.now() - start,
      };
      lastResolution = resolution;
      if (resolution.fallbackUsed) {
        setAiRuntimeConfig({ model });
        logModelEvent({
          configuredModel: configured,
          activeModel: model,
          fallbackTriggered: true,
          retryCount,
          durationMs: resolution.durationMs,
          jobId: params.jobId,
        });
      }
      return { ...res, model, resolution };
    } catch (err) {
      lastErr = err;
      if (isModelNotFound(err)) {
        retryCount++;
        continue;
      }
      throw err;
    }
  }

  const mapped = mapOpenAiError(lastErr, { jobId: params.jobId });
  throw new AiServiceError(
    {
      ...mapped.payload,
      type: "MODEL_NOT_FOUND",
      message: `No compatible model found. Requested "${configured}".`,
      solution: `Set OPENAI_MODEL to a supported model such as gpt-4o-mini, or configure OPENAI_FALLBACK_MODEL.`,
      requestedModel: configured,
      activeModel: mc.fallback,
    },
    mapped.statusCode,
    retryCount
  );
}

export async function checkConfiguredModels(provider: AiProviderId): Promise<ModelCheckResult[]> {
  const mc = getProviderModelConfig(provider);
  const results: ModelCheckResult[] = [];
  const entries: Array<{ id: string; role: ModelCheckResult["role"] }> = [
    { id: mc.primary, role: "primary" },
    { id: mc.fallback, role: "fallback" },
    { id: mc.reasoning, role: "reasoning" },
    { id: mc.embedding, role: "embedding" },
  ];

  const health = getModelHealth();
  const available = new Set(health?.availableModels || []);

  for (const entry of entries) {
    if (!entry.id) continue;
    let availableOk = false;
    let reason: string | undefined;

    if (provider === "openai" || provider === "azure_openai") {
      if (!process.env.OPENAI_API_KEY && !process.env.AZURE_OPENAI_API_KEY) {
        reason = "API key missing";
      } else if (available.size) {
        availableOk = available.has(entry.id);
        if (!availableOk) reason = "Not available for this API key";
      } else {
        availableOk = entry.id === health?.activeModel;
        if (!availableOk) reason = "Could not verify — will retry on request";
      }
    } else if (provider === "ollama") {
      const models = getOllamaDetection().models;
      availableOk = models.some((m) => m === entry.id || m.startsWith(`${entry.id}:`));
      if (!availableOk) reason = "Not installed — run ollama pull";
    } else {
      availableOk = true;
    }

    results.push({ id: entry.id, role: entry.role, available: availableOk, reason });
  }

  for (const safe of readSafeModels()[provider] || []) {
    if (results.some((r) => r.id === safe)) continue;
    const ok =
      provider === "ollama"
        ? getOllamaDetection().models.some((m) => m.startsWith(safe))
        : available.size
          ? available.has(safe)
          : false;
    results.push({ id: safe, role: "safe", available: ok, reason: ok ? undefined : "Not available" });
  }

  return results;
}