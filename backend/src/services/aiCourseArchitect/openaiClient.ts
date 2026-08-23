/**
 * Shared OpenAI client for AI Course Architect.
 * Agents must use getOpenAi() — never a bare `openai` identifier.
 */
import OpenAI from 'openai';

export function getOpenAi(): OpenAI | null {
  const k = process.env.OPENAI_API_KEY?.trim();
  return k ? new OpenAI({ apiKey: k }) : null;
}

export function hasOpenAiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function hasArchitectAiProvider(): boolean {
  return architectAiProviderStatus().configured;
}

export function architectAiProviderStatus(): {
  openai: boolean;
  anthropic: boolean;
  gemini: boolean;
  configured: boolean;
} {
  const openai = Boolean(process.env.OPENAI_API_KEY?.trim());
  const anthropic = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  const gemini = Boolean(
    process.env.GOOGLE_AI_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim()
  );
  return { openai, anthropic, gemini, configured: openai || anthropic || gemini };
}
