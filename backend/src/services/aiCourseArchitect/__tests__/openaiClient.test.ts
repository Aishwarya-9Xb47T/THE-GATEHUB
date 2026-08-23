import { afterEach, describe, expect, it } from "@jest/globals";
import {
  architectAiProviderStatus,
  formatArchitectAiStartupLines,
  ARCHITECT_AI_MISSING_KEY_MESSAGE,
} from "../openaiClient.js";
import { getArchitectModelRoute } from "../architectModels.js";

describe("architectAiProviderStatus", () => {
  const original = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    CLAUDE_API_KEY: process.env.CLAUDE_API_KEY,
    GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GOOGLE_GEMINI_API_KEY: process.env.GOOGLE_GEMINI_API_KEY,
  };

  afterEach(() => {
    process.env.OPENAI_API_KEY = original.OPENAI_API_KEY;
    process.env.ANTHROPIC_API_KEY = original.ANTHROPIC_API_KEY;
    process.env.CLAUDE_API_KEY = original.CLAUDE_API_KEY;
    process.env.GOOGLE_AI_API_KEY = original.GOOGLE_AI_API_KEY;
    process.env.GEMINI_API_KEY = original.GEMINI_API_KEY;
    process.env.GOOGLE_GEMINI_API_KEY = original.GOOGLE_GEMINI_API_KEY;
  });

  function clearKeys() {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CLAUDE_API_KEY;
    delete process.env.GOOGLE_AI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_GEMINI_API_KEY;
  }

  it("reports unconfigured when no architect keys are set", () => {
    clearKeys();
    expect(architectAiProviderStatus()).toEqual({
      openai: false,
      anthropic: false,
      gemini: false,
      configured: false,
      selected: null,
    });
  });

  it("selects OpenAI when OPENAI_API_KEY is the only key", () => {
    clearKeys();
    process.env.OPENAI_API_KEY = "test-openai-key-value";
    expect(architectAiProviderStatus().selected).toBe("openai");
    expect(architectAiProviderStatus().configured).toBe(true);
  });

  it("selects Anthropic from CLAUDE_API_KEY when OpenAI is missing", () => {
    clearKeys();
    process.env.CLAUDE_API_KEY = "test-claude-key-value";
    expect(architectAiProviderStatus().selected).toBe("anthropic");
  });

  it("selects Gemini from GOOGLE_GEMINI_API_KEY when OpenAI is missing", () => {
    clearKeys();
    process.env.GOOGLE_GEMINI_API_KEY = "test-gemini-key-value";
    expect(architectAiProviderStatus().selected).toBe("gemini");
  });

  it("prefers OpenAI when multiple keys are present", () => {
    clearKeys();
    process.env.OPENAI_API_KEY = "test-openai-key-value";
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key-value";
    process.env.GEMINI_API_KEY = "test-gemini-key-value";
    expect(architectAiProviderStatus().selected).toBe("openai");
  });

  it("routes research to Gemini when only a Gemini key is configured", () => {
    clearKeys();
    process.env.GEMINI_API_KEY = "test-gemini-key-value";
    expect(getArchitectModelRoute("research").family).toBe("google");
  });

  it("startup lines never include secret values", () => {
    clearKeys();
    process.env.OPENAI_API_KEY = "sk-secret-must-not-appear";
    const lines = formatArchitectAiStartupLines().join("\n");
    expect(lines).toContain("OPENAI: CONFIGURED");
    expect(lines).toContain("ANTHROPIC: NOT CONFIGURED");
    expect(lines).toContain("GEMINI: NOT CONFIGURED");
    expect(lines).not.toContain("sk-secret-must-not-appear");
    expect(ARCHITECT_AI_MISSING_KEY_MESSAGE).toContain("OPENAI_API_KEY");
  });
});
