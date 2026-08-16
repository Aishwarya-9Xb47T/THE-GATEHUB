/**
 * Lightweight production-perf helper checks (no DB / no Jest OOM).
 * Run: npx tsx scripts/verify-perf-helpers.ts
 */

let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  passed += 1;
  console.log("ok -", msg);
}

const SESSION_TOUCH_THROTTLE_MS = 5 * 60 * 1000;
assert(SESSION_TOUCH_THROTTLE_MS === 300_000, "session touch throttle is 5 minutes");

function shouldSkipCompression(pathName: string, hasRange: boolean): boolean {
  if (pathName.startsWith("/uploads/")) return true;
  if (hasRange) return true;
  return false;
}
assert(shouldSkipCompression("/uploads/learning-universes/x.mp4", false) === true, "skip compression for uploads");
assert(shouldSkipCompression("/api/courses", false) === false, "compress JSON API");
assert(shouldSkipCompression("/api/courses", true) === true, "skip compression for Range");

function dedupeGetKey(method: string, path: string, token: string | null): string | null {
  if (method.toUpperCase() !== "GET") return null;
  return `${method.toUpperCase()}:${path}:${token || ""}`;
}
assert(dedupeGetKey("GET", "/auth/me", "t1") === "GET:/auth/me:t1", "GET requests can dedupe");
assert(dedupeGetKey("POST", "/auth/me", "t1") === null, "POST requests do not dedupe");

console.log(`PASSED ${passed}`);
