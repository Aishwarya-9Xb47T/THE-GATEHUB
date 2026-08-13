/**
 * Production startup validation — run after migrations, before serving traffic.
 * Exits non-zero on hard failures so orchestrators can restart the container.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const errors: string[] = [];
const warnings: string[] = [];

function requireEnv(name: string, minLength = 1): void {
  const value = process.env[name]?.trim();
  if (!value || value.length < minLength) {
    errors.push(`Missing or invalid ${name}`);
  }
}

requireEnv("DATABASE_URL");
requireEnv("JWT_SECRET", 32);

const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
try {
  fs.mkdirSync(uploadDir, { recursive: true });
  const probe = path.join(uploadDir, ".write-probe");
  fs.writeFileSync(probe, "ok");
  fs.unlinkSync(probe);
} catch {
  errors.push(`UPLOAD_DIR is not writable: ${uploadDir}`);
}

if (process.env.NODE_ENV === "production") {
  if (!process.env.CLIENT_URL) warnings.push("CLIENT_URL is not set (CORS may be misconfigured)");
  if (!process.env.API_URL) warnings.push("API_URL is not set (absolute links may break)");
  if (process.env.LU_REQUIRE_PDF_ON_PUBLISH !== "true") {
    warnings.push("LU_REQUIRE_PDF_ON_PUBLISH is not true — PDF publish gate is relaxed");
  }
}

const prisma = new PrismaClient();
try {
  await prisma.$queryRaw`SELECT 1`;
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  errors.push(`Database connectivity check failed: ${message}`);
} finally {
  await prisma.$disconnect();
}

for (const w of warnings) console.warn(`[startup:warn] ${w}`);
for (const e of errors) console.error(`[startup:error] ${e}`);

if (errors.length > 0) {
  console.error(`[startup] FAILED with ${errors.length} error(s)`);
  process.exit(1);
}

console.log("[startup] PASS — environment, storage, and database checks OK");
