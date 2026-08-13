import OpenAI from "openai";
import type { AiChatMessage, AiCompletionOptions, AiCompletionResult, AiHealthStatus } from "./AIProvider.js";
import { BaseChatProvider } from "./BaseChatProvider.js";
import { getAiRuntimeConfig } from "../AiRuntimeConfig.js";
import { mapOpenAiError } from "../../assessmentStudio/aiAssessment/ErrorMapper.js";
import { completeWithModelFallback, getModelHealth, getProviderModelConfig } from "../AiModelManager.js";

export class OpenAIProvider extends BaseChatProvider {
  readonly id = "openai" as const;
  readonly name = "OpenAI";

  private client(): OpenAI | null {
    return process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
  }

  async healthCheck(): Promise<AiHealthStatus> {
    const mc = getProviderModelConfig(this.id);
    const health = getModelHealth();
    const ok = !!process.env.OPENAI_API_KEY && (health?.authentication === "ok" || health?.authentication === "unknown");
    return {
      healthy: ok && !!process.env.OPENAI_API_KEY,
      provider: this.id,
      model: health?.activeModel || mc.primary,
      message: ok ? (health?.fallbackUsed ? `Using ${health.activeModel} (fallback)` : "API key configured") : "OPENAI_API_KEY not set",
      streaming: true,
    };
  }

  protected async complete(messages: AiChatMessage[], options?: AiCompletionOptions): Promise<AiCompletionResult> {
    const openai = this.client();
    if (!openai) throw mapOpenAiError(new Error("OPENAI_API_KEY missing"));
    const cfg = this.cfg();
    const requested = options?.model || cfg.model || getProviderModelConfig(this.id).primary;
    const start = Date.now();

    const run = async (model: string) => {
      const opts = options;
      if (opts?.onToken) {
        const stream = await openai.chat.completions.create({
          model,
          messages,
          temperature: opts.temperature ?? cfg.temperature,
          max_tokens: opts.maxTokens ?? cfg.maxTokens,
          response_format: opts.jsonMode ? { type: "json_object" } : undefined,
          stream: true,
        });
        let content = "";
        for await (const chunk of stream) {
          const token = chunk.choices[0]?.delta?.content || "";
          if (token) {
            content += token;
            opts.onToken(token);
          }
        }
        return { content };
      }

      const res = await openai.chat.completions.create({
        model,
        messages,
        temperature: opts?.temperature ?? cfg.temperature,
        max_tokens: opts?.maxTokens ?? cfg.maxTokens,
        response_format: opts?.jsonMode ? { type: "json_object" } : undefined,
      });
      return { content: res.choices[0]?.message?.content || "", tokens: res.usage?.total_tokens };
    };

    try {
      const out = await completeWithModelFallback({
        provider: this.id,
        requestedModel: requested,
        complete: run,
      });
      const result: AiCompletionResult = {
        content: out.content,
        tokens: out.tokens,
        model: out.model,
        provider: this.id,
        durationMs: Date.now() - start,
        modelResolution: out.resolution,
      };
      this.track(result, true);
      return result;
    } catch (err) {
      throw mapOpenAiError(err);
    }
  }
}
