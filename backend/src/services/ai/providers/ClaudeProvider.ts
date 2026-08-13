import type { AiChatMessage, AiCompletionOptions, AiCompletionResult, AiHealthStatus } from "./AIProvider.js";
import { BaseChatProvider } from "./BaseChatProvider.js";
import { getAiRuntimeConfig } from "../AiRuntimeConfig.js";
import { mapOpenAiError } from "../../assessmentStudio/aiAssessment/ErrorMapper.js";

export class ClaudeProvider extends BaseChatProvider {
  readonly id = "claude" as const;
  readonly name = "Anthropic Claude";

  async healthCheck(): Promise<AiHealthStatus> {
    const ok = !!(process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY);
    return { healthy: ok, provider: this.id, model: this.cfg().model || "claude-3-5-haiku-latest", message: ok ? "API key configured" : "CLAUDE_API_KEY not set" };
  }

  protected async complete(messages: AiChatMessage[], options?: AiCompletionOptions): Promise<AiCompletionResult> {
    const key = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!key) throw mapOpenAiError(new Error("CLAUDE_API_KEY missing"));
    const cfg = this.cfg();
    const model = options?.model || cfg.model || "claude-3-5-haiku-latest";
    const start = Date.now();
    const system = messages.find((m) => m.role === "system")?.content;
    const chatMessages = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: options?.maxTokens ?? cfg.maxTokens,
        system,
        messages: chatMessages,
        temperature: options?.temperature ?? cfg.temperature,
      }),
      signal: options?.signal,
    });
    if (!res.ok) throw mapOpenAiError(new Error(`Claude error ${res.status}`));
    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const content = json.content?.filter((c) => c.type === "text").map((c) => c.text || "").join("") || "";
    const result = { content, model, provider: this.id, durationMs: Date.now() - start };
    this.track(result, true);
    return result;
  }
}
