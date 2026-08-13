import type { AiChatMessage, AiCompletionOptions, AiCompletionResult, AiHealthStatus } from "./AIProvider.js";
import { BaseChatProvider } from "./BaseChatProvider.js";
import { getAiRuntimeConfig, getOllamaDetection } from "../AiRuntimeConfig.js";
import { ollamaChat, ollamaHealth, pickOllamaModel } from "../ollamaClient.js";
import { mapOpenAiError } from "../../assessmentStudio/aiAssessment/ErrorMapper.js";
import { completeWithModelFallback, getProviderModelConfig } from "../AiModelManager.js";

export class OllamaProvider extends BaseChatProvider {
  readonly id = "ollama" as const;
  readonly name = "Ollama (Local)";

  async healthCheck(): Promise<AiHealthStatus> {
    const cfg = this.cfg();
    const h = await ollamaHealth(cfg.ollamaHost);
    const mc = getProviderModelConfig(this.id);
    return {
      healthy: h.ok && h.models.length > 0,
      provider: this.id,
      model: pickOllamaModel(mc.primary, h.models),
      message: h.message,
      models: h.models,
      streaming: cfg.streamingEnabled,
    };
  }

  protected async complete(messages: AiChatMessage[], options?: AiCompletionOptions): Promise<AiCompletionResult> {
    const cfg = this.cfg();
    const requested = options?.model || cfg.model || getProviderModelConfig(this.id).primary;
    const start = Date.now();

    try {
      const out = await completeWithModelFallback({
        provider: this.id,
        requestedModel: requested,
        complete: async (model) => {
          const res = await ollamaChat(
            cfg.ollamaHost,
            {
              model,
              messages: messages.map((m) => ({ role: m.role, content: m.content })),
              stream: cfg.streamingEnabled && !!options?.onToken,
              format: options?.jsonMode ? "json" : undefined,
              options: {
                temperature: options?.temperature ?? cfg.temperature,
                top_p: options?.topP ?? cfg.topP,
                top_k: options?.topK ?? cfg.topK,
                num_predict: options?.maxTokens ?? cfg.maxTokens,
              },
            },
            {
              signal: options?.signal,
              onToken: options?.onToken,
              timeoutMs: options?.timeoutMs ?? cfg.timeoutMs,
            }
          );
          return { content: res.content, tokens: Math.round(res.content.length / 4) };
        },
      });

      const result: AiCompletionResult = {
        content: out.content,
        model: out.model,
        provider: this.id,
        durationMs: Date.now() - start,
        tokens: out.tokens,
        modelResolution: out.resolution,
      };
      this.track(result, true);
      return result;
    } catch (err) {
      throw mapOpenAiError(err);
    }
  }
}
