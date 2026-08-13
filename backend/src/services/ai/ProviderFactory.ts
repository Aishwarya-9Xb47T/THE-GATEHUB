import type { AIProvider, AiProviderId } from "./providers/AIProvider.js";
import { OllamaProvider } from "./providers/OllamaProvider.js";
import { OpenAIProvider } from "./providers/OpenAIProvider.js";
import { AzureOpenAIProvider } from "./providers/AzureOpenAIProvider.js";
import { GeminiProvider } from "./providers/GeminiProvider.js";
import { ClaudeProvider } from "./providers/ClaudeProvider.js";
import { MockProvider } from "./providers/MockProvider.js";

const instances: Partial<Record<AiProviderId, AIProvider>> = {};

export function createProvider(id: AiProviderId): AIProvider {
  if (instances[id]) return instances[id]!;
  switch (id) {
    case "ollama":
      instances[id] = new OllamaProvider();
      break;
    case "openai":
      instances[id] = new OpenAIProvider();
      break;
    case "gemini":
      instances[id] = new GeminiProvider();
      break;
    case "claude":
      instances[id] = new ClaudeProvider();
      break;
    case "azure_openai":
      instances[id] = new AzureOpenAIProvider();
      break;
    case "mock":
    default:
      instances[id] = new MockProvider();
      break;
  }
  return instances[id]!;
}

export function listProviderIds(): AiProviderId[] {
  return ["ollama", "openai", "gemini", "claude", "azure_openai", "mock"];
}

export async function listProvidersHealth() {
  return Promise.all(
    listProviderIds().map(async (id) => {
      const p = createProvider(id);
      const h = await p.healthCheck();
      return { id, name: p.name, ...h };
    })
  );
}
