import type { AiChatMessage, AiCompletionOptions, AiCompletionResult, AiHealthStatus } from "./AIProvider.js";
import { BaseChatProvider } from "./BaseChatProvider.js";
import { getAiRuntimeConfig } from "../AiRuntimeConfig.js";
import { mapOpenAiError } from "../../assessmentStudio/aiAssessment/ErrorMapper.js";

export class GeminiProvider extends BaseChatProvider {
  readonly id = "gemini" as const;
  readonly name = "Google Gemini";

  async healthCheck(): Promise<AiHealthStatus> {
    const ok = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY);
    return { healthy: ok, provider: this.id, model: this.cfg().model || "gemini-1.5-flash", message: ok ? "API key configured" : "GEMINI_API_KEY not set" };
  }

  protected async complete(messages: AiChatMessage[], options?: AiCompletionOptions): Promise<AiCompletionResult> {
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
    if (!key) throw mapOpenAiError(new Error("GEMINI_API_KEY missing"));
    const cfg = this.cfg();
    const model = options?.model || cfg.model || "gemini-1.5-flash";
    const start = Date.now();
    const system = messages.find((m) => m.role === "system")?.content || "";
    const user = messages.filter((m) => m.role !== "system").map((m) => m.content).join("\n\n");

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: system ? { parts: [{ text: system }] } : undefined,
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: {
            temperature: options?.temperature ?? cfg.temperature,
            maxOutputTokens: options?.maxTokens ?? cfg.maxTokens,
            responseMimeType: options?.jsonMode ? "application/json" : "text/plain",
          },
        }),
        signal: options?.signal,
      }
    );
    if (!res.ok) throw mapOpenAiError(new Error(`Gemini error ${res.status}`));
    const json = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const content = json.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    const result = { content, model, provider: this.id, durationMs: Date.now() - start };
    this.track(result, true);
    return result;
  }
}
