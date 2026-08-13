import OpenAI from "openai";
import type { AiChatMessage, AiCompletionOptions, AiCompletionResult, AiHealthStatus } from "./AIProvider.js";
import { BaseChatProvider } from "./BaseChatProvider.js";
import { getAiRuntimeConfig } from "../AiRuntimeConfig.js";
import { mapOpenAiError } from "../../assessmentStudio/aiAssessment/ErrorMapper.js";

export class AzureOpenAIProvider extends BaseChatProvider {
  readonly id = "azure_openai" as const;
  readonly name = "Azure OpenAI";

  private getClient(): OpenAI {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const key = process.env.AZURE_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || getAiRuntimeConfig().model || "gpt-4o-mini";
    if (!endpoint || !key) throw mapOpenAiError(new Error("Azure OpenAI not configured"));
    return new OpenAI({
      apiKey: key,
      baseURL: `${endpoint.replace(/\/$/, "")}/openai/deployments/${deployment}`,
      defaultQuery: { "api-version": process.env.AZURE_OPENAI_API_VERSION || "2024-02-15-preview" },
    });
  }

  async healthCheck(): Promise<AiHealthStatus> {
    const ok = !!(process.env.AZURE_OPENAI_ENDPOINT && (process.env.AZURE_OPENAI_API_KEY || process.env.OPENAI_API_KEY));
    return {
      healthy: ok,
      provider: this.id,
      model: process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o-mini",
      message: ok ? "Azure OpenAI configured" : "Azure credentials missing",
    };
  }

  protected async complete(messages: AiChatMessage[], options?: AiCompletionOptions): Promise<AiCompletionResult> {
    const openai = this.getClient();
    const cfg = getAiRuntimeConfig();
    const model = process.env.AZURE_OPENAI_DEPLOYMENT || cfg.model;
    const start = Date.now();
    try {
      const res = await openai.chat.completions.create({
        model,
        messages,
        temperature: options?.temperature ?? cfg.temperature,
        max_tokens: options?.maxTokens ?? cfg.maxTokens,
        response_format: options?.jsonMode ? { type: "json_object" } : undefined,
      });
      const result: AiCompletionResult = {
        content: res.choices[0]?.message?.content || "",
        tokens: res.usage?.total_tokens,
        model,
        provider: this.id,
        durationMs: Date.now() - start,
      };
      this.track(result, true);
      return result;
    } catch (err) {
      throw mapOpenAiError(err);
    }
  }
}
