import type { AiRuntimeConfig } from "./AiRuntimeConfig.js";

export interface OllamaModel {
  name: string;
  size?: number;
  modified_at?: string;
}

export async function ollamaHealth(host: string, timeoutMs = 5000): Promise<{ ok: boolean; models: string[]; message: string }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${host.replace(/\/$/, "")}/api/tags`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return { ok: false, models: [], message: `Ollama returned ${res.status}` };
    const json = (await res.json()) as { models?: OllamaModel[] };
    const models = (json.models || []).map((m) => m.name);
    return { ok: true, models, message: models.length ? `${models.length} model(s) available` : "No models installed" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Connection refused";
    return { ok: false, models: [], message: msg.includes("abort") ? "Ollama health check timed out" : msg };
  }
}

export async function ollamaChat(
  host: string,
  body: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    stream?: boolean;
    format?: "json";
    options?: { temperature?: number; top_p?: number; top_k?: number; num_predict?: number };
  },
  opts?: { signal?: AbortSignal; onToken?: (t: string) => void; timeoutMs?: number }
): Promise<{ content: string }> {
  const url = `${host.replace(/\/$/, "")}/api/chat`;
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), opts?.timeoutMs ?? 120000);
  const signal = opts?.signal
    ? AbortSignal.any([opts.signal, ctrl.signal])
    : ctrl.signal;

  if (body.stream && opts?.onToken) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, stream: true }),
      signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`Ollama chat failed (${res.status})`);
    if (!res.body) throw new Error("Ollama stream unavailable");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
          const token = chunk.message?.content || "";
          if (token) {
            full += token;
            opts.onToken(token);
          }
        } catch {
          /* skip */
        }
      }
    }
    return { content: full };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, stream: false }),
    signal,
  });
  clearTimeout(timeout);
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    if (res.status === 404) throw new Error(`Ollama model not found: ${body.model}`);
    throw new Error(`Ollama chat failed (${res.status}): ${errText.slice(0, 200)}`);
  }
  const json = (await res.json()) as { message?: { content?: string } };
  return { content: json.message?.content || "" };
}

export function pickOllamaModel(requested: string, available: string[]): string {
  if (available.includes(requested)) return requested;
  const preferred = ["llama3.1", "llama3.2", "qwen2.5", "mistral", "phi3", "deepseek-r1", "gemma3", "codellama"];
  for (const p of preferred) {
    const hit = available.find((m) => m.startsWith(p));
    if (hit) return hit;
  }
  return available[0] || requested;
}
