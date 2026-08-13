/**
 * Copies markdown documentation from backend/content/docs to frontend/src/content/docs.
 * Run after editing docs in backend: npm run sync-docs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "../../content/docs");
const DEST = path.resolve(__dirname, "../../../frontend/src/content/docs");

function syncDocs() {
  if (!fs.existsSync(SRC)) {
    console.error(`[sync-docs] Source not found: ${SRC}`);
    process.exit(1);
  }
  fs.mkdirSync(DEST, { recursive: true });

  const files = fs.readdirSync(SRC).filter((f) => f.endsWith(".md"));
  let copied = 0;
  for (const file of files) {
    fs.copyFileSync(path.join(SRC, file), path.join(DEST, file));
    copied++;
  }
  console.log(`[sync-docs] Copied ${copied} markdown files to frontend/src/content/docs`);
}

syncDocs();
