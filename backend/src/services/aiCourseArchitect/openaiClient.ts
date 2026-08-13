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
