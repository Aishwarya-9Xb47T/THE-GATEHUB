/**
 * Shared AI clients for AI Course Architect.
 * Keys are backend-only — never log values, never send them to the frontend.
 */
import OpenAI from "openai";

function envKey(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v || undefined;
}

export function getOpenAiApiKey(): string | undefined {
  return envKey("OPENAI_API_KEY");
}

export function getAnthropicApiKey(): string | undefined {
  return envKey("ANTHROPIC_API_KEY") || envKey("CLAUDE_API_KEY");
}

export function getGeminiApiKey(): string | undefined {
  return envKey("GOOGLE_AI_API_KEY") || envKey("GEMINI_API_KEY") || envKey("GOOGLE_GEMINI_API_KEY");
}

export function getOpenAi(): OpenAI | null {
  const k = envKey("OPENAI_API_KEY");
  return k ? new OpenAI({ apiKey: k }) : null;
}

export function hasOpenAiKey(): boolean {
  return Boolean(getOpenAiApiKey());
}

export function hasArchitectAiProvider(): boolean {
  return architectAiProviderStatus().configured;
}

export type ArchitectAiFamily = "openai" | "anthropic" | "gemini";

export function architectAiProviderStatus(): {
  openai: boolean;
  anthropic: boolean;
  gemini: boolean;
  configured: boolean;
  selected: ArchitectAiFamily | null;
} {
  const openai = Boolean(getOpenAiApiKey());
  const anthropic = Boolean(getAnthropicApiKey());
  const gemini = Boolean(getGeminiApiKey());
  const selected: ArchitectAiFamily | null = openai ? "openai" : anthropic ? "anthropic" : gemini ? "gemini" : null;
  return { openai, anthropic, gemini, configured: Boolean(selected), selected };
}

export function formatArchitectAiStartupLines(): string[] {
  const s = architectAiProviderStatus();
  return [
    "[AI] Provider configuration:",
    `OPENAI: ${s.openai ? "CONFIGURED" : "NOT CONFIGURED"}`,
    `ANTHROPIC: ${s.anthropic ? "CONFIGURED" : "NOT CONFIGURED"}`,
    `GEMINI: ${s.gemini ? "CONFIGURED" : "NOT CONFIGURED"}`,
    s.selected
      ? `[AI] Research & Plan Curriculum will use: ${s.selected.toUpperCase()}`
      : "[AI] Research & Plan Curriculum will fail until OPENAI_API_KEY (preferred) or ANTHROPIC_API_KEY / GEMINI_API_KEY is set on this backend service.",
  ];
}

export function logArchitectAiStartupStatus(): void {
  for (const line of formatArchitectAiStartupLines()) {
    if (line.includes("will fail")) console.warn(line);
    else console.log(line);
  }
}

export const ARCHITECT_AI_MISSING_KEY_MESSAGE =
  "No AI provider is configured on the backend. Configure OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_GEMINI_API_KEY in the backend environment.";
