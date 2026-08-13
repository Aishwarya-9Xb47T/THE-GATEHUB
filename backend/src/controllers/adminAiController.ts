import { Response } from "express";
import { z } from "zod";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";
import { AiRouter } from "../services/ai/AiRouter.js";
import { listProvidersHealth } from "../services/ai/ProviderFactory.js";
import { getAiRuntimeConfig, setAiRuntimeConfig } from "../services/ai/AiRuntimeConfig.js";
import { updatePlatformSettings } from "../services/platformSettingsService.js";
import { ollamaHealth } from "../services/ai/ollamaClient.js";

export async function getAiProviders(_req: AuthRequest, res: Response) {
  const providers = await listProvidersHealth();
  const status = await AiRouter.healthCheck();
  res.json({ success: true, data: { providers, status } });
}

export async function getAiModels(_req: AuthRequest, res: Response) {
  const cfg = getAiRuntimeConfig();
  const ollama = await ollamaHealth(cfg.ollamaHost);
  const status = await AiRouter.healthCheck();
  const { checkConfiguredModels, getModelHealth, getProviderModelConfig } = await import("../services/ai/AiModelManager.js");
  const checks = await checkConfiguredModels(cfg.provider);
  const modelHealth = getModelHealth();
  const mc = getProviderModelConfig(cfg.provider);

  const models: Array<{ id: string; provider: string; label: string; available?: boolean }> = [];

  for (const m of ollama.models) {
    models.push({ id: m, provider: "ollama", label: m, available: true });
  }

  for (const check of checks) {
    if (!models.some((m) => m.id === check.id)) {
      models.push({
        id: check.id,
        provider: cfg.provider,
        label: check.id,
        available: check.available,
      });
    }
  }

  res.json({
    success: true,
    data: {
      models,
      configured: {
        primary: mc.primary,
        fallback: mc.fallback,
        reasoning: mc.reasoning,
        embedding: mc.embedding,
      },
      checks,
      detected: ollama.models,
      active: {
        provider: status.activeProvider,
        model: modelHealth?.activeModel || status.health.model || cfg.model,
        fallbackUsed: modelHealth?.fallbackUsed ?? false,
      },
      benchmark: status.benchmark,
    },
  });
}

export async function getAiHealth(_req: AuthRequest, res: Response) {
  const cfg = getAiRuntimeConfig();
  const status = await AiRouter.healthCheck();
  const { getModelHealth, getProviderModelConfig, getLastModelResolution } = await import("../services/ai/AiModelManager.js");
  const { getOllamaDetection } = await import("../services/ai/AiRuntimeConfig.js");
  const modelHealth = getModelHealth();
  const mc = getProviderModelConfig(cfg.provider);
  const last = getLastModelResolution();
  const ollama = getOllamaDetection();

  res.json({
    success: true,
    data: {
      provider: cfg.provider,
      activeProvider: status.activeProvider,
      configuredModel: mc.primary,
      activeModel: modelHealth?.activeModel || cfg.model,
      fallbackModel: mc.fallback,
      fallbackUsed: modelHealth?.fallbackUsed || last?.fallbackUsed || false,
      apiReachable: modelHealth?.apiReachable ?? status.health.healthy,
      authentication: modelHealth?.authentication ?? "unknown",
      latencyMs: modelHealth?.latencyMs,
      lastError: modelHealth?.lastError,
      streamingEnabled: cfg.streamingEnabled,
      ollama,
      benchmark: status.benchmark,
      note: status.note,
    },
  });
}

export async function setAiProvider(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const body = z.object({ provider: z.enum(["ollama", "openai", "gemini", "claude", "azure_openai", "mock"]) }).parse(req.body);
  setAiRuntimeConfig({ provider: body.provider });
  await updatePlatformSettings({ aiProvider: body.provider }, req.user.id);
  const status = await AiRouter.healthCheck();
  res.json({ success: true, data: status });
}

export async function setAiModel(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const body = z.object({ model: z.string().min(1) }).parse(req.body);
  setAiRuntimeConfig({ model: body.model });
  await updatePlatformSettings({ aiModelName: body.model }, req.user.id);
  const status = await AiRouter.healthCheck();
  res.json({ success: true, data: status });
}

export async function patchAiConfig(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const body = z
    .object({
      temperature: z.number().min(0).max(2).optional(),
      topP: z.number().min(0).max(1).optional(),
      topK: z.number().int().min(1).optional(),
      maxTokens: z.number().int().min(256).optional(),
      timeoutMs: z.number().int().min(5000).optional(),
      streamingEnabled: z.boolean().optional(),
      ollamaHost: z.string().min(1).optional(),
    })
    .parse(req.body ?? {});
  setAiRuntimeConfig(body);
  res.json({ success: true, data: getAiRuntimeConfig() });
}

export async function getAiStatus(_req: AuthRequest, res: Response) {
  const status = await AiRouter.healthCheck();
  res.json({ success: true, data: status });
}
