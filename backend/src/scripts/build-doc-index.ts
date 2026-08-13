import "dotenv/config";
import { buildVectorIndex } from "../services/docsVectorStore.js";
import { indexDocumentation, invalidateChunkCache } from "../services/docsIndexService.js";
import { logger } from "../utils/logger.js";

async function main() {
  logger.info("[build-doc-index] Starting documentation index build...");
  invalidateChunkCache();
  const chunks = indexDocumentation(true);
  logger.info(`[build-doc-index] Indexed ${chunks.length} chunks from markdown`);

  const index = await buildVectorIndex({ useOpenAI: !!process.env.OPENAI_API_KEY });
  logger.info(`[build-doc-index] Complete. ${index.chunks.length} chunks, vocabulary ${index.vocabulary.length} terms`);
  logger.info(`[build-doc-index] Output: backend/content/docs/vector-index.json`);
  process.exit(0);
}

main().catch((err) => {
  logger.error("[build-doc-index] Failed", { err });
  process.exit(1);
});
