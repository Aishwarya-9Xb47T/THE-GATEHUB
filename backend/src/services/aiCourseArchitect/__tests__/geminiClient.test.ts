import { afterEach, describe, expect, it, jest } from "@jest/globals";
import {
  architectGeminiModels,
  DEFAULT_GEMINI_MODEL,
  extractGeminiText,
  parseGeminiErrorBody,
  callGeminiGenerateContent,
} from "../geminiClient.js";

describe("geminiClient", () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.GOOGLE_GEMINI_API_KEY;

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.GOOGLE_GEMINI_API_KEY = originalKey;
    jest.useRealTimers();
  });

  it("defaults to a current free Gemini 2.5 model, not shut-down gemini-2.0-flash", () => {
    expect(DEFAULT_GEMINI_MODEL).toBe("gemini-2.5-flash");
    expect(architectGeminiModels()).not.toContain("gemini-2.0-flash");
    expect(architectGeminiModels()).not.toContain("gemini-1.5-flash");
    expect(architectGeminiModels()[0]).toBe("gemini-2.5-flash");
  });

  it("extracts text from non-thought parts", () => {
    const extracted = extractGeminiText({
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [{ thought: true, text: "thinking" }, { text: '{"ok":true}' }],
          },
        },
      ],
    });
    expect(extracted.text).toBe('{"ok":true}');
    expect(extracted.candidateCount).toBe(1);
    expect(extracted.finishReason).toBe("STOP");
  });

  it("preserves Gemini HTTP error status and message", () => {
    const err = parseGeminiErrorBody(
      404,
      { error: { code: 404, status: "NOT_FOUND", message: "models/gemini-2.0-flash is not found" } },
      "gemini-2.0-flash"
    );
    expect(err.status).toBe(404);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toContain("models/gemini-2.0-flash is not found");
    expect(err.retryable).toBe(false);
  });

  it("does not retry 400 errors when a later free model can succeed", async () => {
    process.env.GOOGLE_GEMINI_API_KEY = "test-gemini-key";
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("gemini-2.0-flash")) {
        return new Response(
          JSON.stringify({ error: { code: 404, status: "NOT_FOUND", message: "model not found" } }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"ok":true}' }] } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const text = await callGeminiGenerateContent({
      preferredModel: "gemini-2.0-flash",
      system: "sys",
      user: "Return JSON",
      json: true,
    });
    expect(text).toBe('{"ok":true}');
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    const firstUrl = String(fetchMock.mock.calls[0][0]);
    const firstInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(firstUrl).toContain("gemini-2.0-flash");
    expect(firstUrl).not.toContain("test-gemini-key");
    expect(JSON.parse(String(firstInit.body)).generationConfig.responseMimeType).toBe("application/json");
    expect((firstInit.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-gemini-key");
  });

  it("retries a 400 thinkingConfig error on the same model without thinkingConfig", async () => {
    process.env.GOOGLE_GEMINI_API_KEY = "test-gemini-key";
    const fetchMock = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || "{}"));
      if (body.generationConfig?.thinkingConfig) {
        return new Response(
          JSON.stringify({ error: { code: 400, status: "INVALID_ARGUMENT", message: "Unknown name thinkingConfig" } }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"modules":[]}' }] } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const text = await callGeminiGenerateContent({
      preferredModel: "gemini-2.5-flash",
      system: "sys",
      user: "Return JSON",
      json: true,
    });
    expect(text).toBe('{"modules":[]}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body));
    expect(secondBody.generationConfig.thinkingConfig).toBeUndefined();
  });

  it("retries 429 with backoff and does not retry 403", async () => {
    process.env.GOOGLE_GEMINI_API_KEY = "test-gemini-key";
    const fetchMock = jest.fn(async () => {
      return new Response(
        JSON.stringify({ error: { code: 403, status: "PERMISSION_DENIED", message: "API key not valid" } }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      callGeminiGenerateContent({
        preferredModel: "gemini-2.5-flash",
        system: "sys",
        user: "Return JSON",
      })
    ).rejects.toMatchObject({ status: 403, code: "PERMISSION_DENIED" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries transient 429 then returns output", async () => {
    process.env.GOOGLE_GEMINI_API_KEY = "test-gemini-key";
    let calls = 0;
    const fetchMock = jest.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(
          JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "rate limit" } }),
          { status: 429, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          candidates: [{ finishReason: "STOP", content: { parts: [{ text: "OK" }] } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const text = await callGeminiGenerateContent({
      preferredModel: "gemini-2.5-flash",
      system: "sys",
      user: "Return the word OK.",
      json: false,
    });
    expect(text).toBe("OK");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
