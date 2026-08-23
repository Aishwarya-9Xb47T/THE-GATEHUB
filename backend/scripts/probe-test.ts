import "dotenv/config";
import { architectAiProviderStatus } from "../src/services/aiCourseArchitect/openaiClient.js";
import { probeGeminiConnectivity } from "../src/services/aiCourseArchitect/geminiClient.js";
import { isB2Configured, describeB2ConfigSafe } from "../src/services/b2StorageService.js";

async function main() {
  console.log("=== AI PROVIDER STATUS ===");
  console.log(architectAiProviderStatus());
  console.log("=== B2 STATUS ===");
  console.log(describeB2ConfigSafe());
  console.log("=== PROBING GEMINI ===");
  const probe = await probeGeminiConnectivity();
  console.log("Probe result:", probe);
}

main().catch(console.error);
