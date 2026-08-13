import type { AIProvider, AiCompletionOptions, GenerateAssessmentInput, QuestionActionInput } from "./providers/AIProvider.js";
import type { AiGeneratedQuestion } from "../assessmentStudio/aiAssessment/types.js";
import { createProvider } from "./ProviderFactory.js";
import {
  getAiRuntimeConfig,
  setActiveProviderNote,
  getOllamaDetection,
  setAiRuntimeConfig,
} from "./AiRuntimeConfig.js";
import { getAiBenchmark } from "./aiMetrics.js";
import { getPlatformSettings } from "../platformSettingsService.js";
import { ollamaHealth } from "./ollamaClient.js";
import { MockProvider } from "./providers/MockProvider.js";
import { mapOpenAiError } from "../assessmentStudio/aiAssessment/ErrorMapper.js";
import { isOfflineFallbackError } from "../assessmentStudio/aiAssessment/ApiError.js";
import { validateModelsOnStartup } from "./AiModelManager.js";

let bootstrapped = false;
let lastRunMeta: {
  modelResolution?: import("./AiModelManager.js").ModelResolution;
  usedMock?: boolean;
  devMode?: boolean;
} | null = null;

export function getLastAiRunMeta() {
  return lastRunMeta;
}

export async function bootstrapAiProviders() {
  if (bootstrapped) return;
  const { loadAiRuntimeConfigFromDisk, mergePlatformAiSettings, setOllamaDetection } = await import("./AiRuntimeConfig.js");
  loadAiRuntimeConfigFromDisk();
  const settings = await getPlatformSettings();
  await mergePlatformAiSettings(settings.aiProvider, settings.aiModelName);

  const cfg = getAiRuntimeConfig();
  const ollama = await ollamaHealth(cfg.ollamaHost);
  setOllamaDetection(ollama.ok, ollama.models);

  if (cfg.provider === "ollama" && !ollama.ok) {
    setAiRuntimeConfig({ provider: "mock" });
    setActiveProviderNote(`Ollama unavailable (${ollama.message}) — using Mock Provider`);
  } else if (ollama.ok && ollama.models.length && cfg.provider === "ollama") {
    setActiveProviderNote(`Ollama ready — ${ollama.models.length} model(s)`);
  }

  await validateModelsOnStartup(cfg.provider);

  bootstrapped = true;
}

async function resolveProvider(): Promise<AIProvider> {
  await bootstrapAiProviders();
  const cfg = getAiRuntimeConfig();
  const provider = createProvider(cfg.provider);
  const health = await provider.healthCheck();
  if (health.healthy) return provider;

  if (cfg.provider !== "mock") {
    const mock = createProvider("mock");
    setActiveProviderNote(`${cfg.provider} unhealthy — fallback to Mock`);
    return mock;
  }
  return provider;
}

async function withFallback<T>(fn: (p: AIProvider) => Promise<T>): Promise<T> {
  lastRunMeta = null;
  const primary = await resolveProvider();
  try {
    const result = await fn(primary);
    const resolution = (await import("./AiModelManager.js")).getLastModelResolution();
    if (resolution?.fallbackUsed) {
      lastRunMeta = { modelResolution: resolution };
    }
    return result;
  } catch (err) {
    const mapped = mapOpenAiError(err);
    if (
      primary.id !== "mock" &&
      (isOfflineFallbackError(mapped.payload.type) || mapped.payload.type === "NETWORK_ERROR")
    ) {
      setActiveProviderNote(`Falling back to Mock after ${mapped.payload.type}`);
      lastRunMeta = { usedMock: true, devMode: true };
      return fn(createProvider("mock"));
    }
    if (primary.id !== "mock" && mapped.payload.type === "MODEL_NOT_FOUND") {
      setActiveProviderNote(`No compatible model — using Mock Provider`);
      lastRunMeta = { usedMock: true, devMode: true };
      return fn(createProvider("mock"));
    }
    throw err;
  }
}

export const AiRouter = {
  async getActiveProvider(): Promise<AIProvider> {
    return resolveProvider();
  },

  async healthCheck() {
    await bootstrapAiProviders();
    const cfg = getAiRuntimeConfig();
    const provider = await resolveProvider();
    const health = await provider.healthCheck();
    const ollama = getOllamaDetection();
    const bench = getAiBenchmark();
    return {
      activeProvider: provider.id,
      configuredProvider: cfg.provider,
      note: (await import("./AiRuntimeConfig.js")).getActiveProviderNote(),
      health,
      config: cfg,
      ollama,
      benchmark: {
        ...bench,
        provider: provider.id,
        model: health.model || cfg.model,
        streamingEnabled: cfg.streamingEnabled,
        gpuStatus: ollama.healthy ? "local-gpu-if-available" : "n/a",
        ramUsageMb: Math.round(process.memoryUsage().heapUsed / (1024 * 1024)),
      },
    };
  },

  generateAssessment(input: GenerateAssessmentInput): Promise<AiGeneratedQuestion[]> {
    return withFallback((p) => p.generateAssessment(input));
  },

  improveQuestions(action: string, questions: AiGeneratedQuestion[], config: GenerateAssessmentInput["config"], options?: AiCompletionOptions) {
    return withFallback(async (p) => {
      const out: AiGeneratedQuestion[] = [];
      for (const q of questions) {
        options?.onStage?.(`Improving question…`);
        const refined = await p.improveQuestion({ action, question: q, config, options });
        out.push(refined);
      }
      return out;
    });
  },

  refineQuestion(input: QuestionActionInput) {
    return withFallback((p) => p.improveQuestion(input));
  },

  chat(messages: Parameters<AIProvider["chat"]>[0], options?: AiCompletionOptions) {
    return withFallback((p) => p.chat(messages, options));
  },
};

export { MockProvider };
