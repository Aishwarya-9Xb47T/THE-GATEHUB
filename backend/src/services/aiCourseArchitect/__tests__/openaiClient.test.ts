import { afterEach, describe, expect, it } from "@jest/globals";
import { architectAiProviderStatus } from "../openaiClient.js";

describe("architectAiProviderStatus", () => {
  const original = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  };

  afterEach(() => {
    process.env.OPENAI_API_KEY = original.OPENAI_API_KEY;
    process.env.ANTHROPIC_API_KEY = original.ANTHROPIC_API_KEY;
    process.env.GOOGLE_AI_API_KEY = original.GOOGLE_AI_API_KEY;
    process.env.GEMINI_API_KEY = original.GEMINI_API_KEY;
  });

  it("reports unconfigured when no architect keys are set", () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GOOGLE_AI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    expect(architectAiProviderStatus()).toEqual({
      openai: false,
      anthropic: false,
      gemini: false,
      configured: false,
    });
  });
});
