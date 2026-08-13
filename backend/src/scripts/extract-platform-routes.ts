/**
 * Extracts route paths from frontend App.tsx for AI navigation context.
 * Output: backend/src/generated/app-routes.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_TSX = path.resolve(__dirname, "../../../frontend/src/App.tsx");
const OUT = path.resolve(__dirname, "../generated/app-routes.json");

const ROUTE_RE = /\bpath=["']([^"']+)["']/g;

function extractRoutes(): string[] {
  const src = fs.readFileSync(APP_TSX, "utf8");
  const routes = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = ROUTE_RE.exec(src)) !== null) {
    const p = m[1];
    if (p === "*" || p.startsWith(":")) continue;
    routes.add(p.startsWith("/") ? p : `/${p}`);
  }
  return [...routes].sort();
}

function main() {
  const routes = extractRoutes();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), routes }, null, 2));
  console.log(`[extract-platform-routes] Wrote ${routes.length} routes to ${OUT}`);
}

main();
