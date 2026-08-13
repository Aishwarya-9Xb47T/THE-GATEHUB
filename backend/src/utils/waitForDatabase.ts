import { prisma } from "./prisma.js";

export async function waitForDatabase(maxAttempts = 30, delayMs = 2000): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      if (attempt > 1) {
        console.log(`[PRISMA] Database connected on attempt ${attempt}`);
      }
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempt === 1) {
        console.warn("[PRISMA] Database not reachable yet — waiting for PostgreSQL...");
        console.warn(`[PRISMA] ${message}`);
      } else if (attempt % 5 === 0) {
        console.warn(`[PRISMA] Still waiting... (${attempt}/${maxAttempts})`);
      }
      if (attempt === maxAttempts) {
        throw new Error(
          `Database unavailable after ${maxAttempts} attempts. ` +
            "Start Docker Desktop, then run: docker compose -f docker-compose.dev.yml up -d postgres"
        );
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

export function isDatabaseConnectionError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string })?.code;
  return (
    code === "P1001" ||
    code === "P1017" ||
    message.includes("Can't reach database") ||
    message.includes("ECONNREFUSED") ||
    message.includes("Connection refused") ||
    message.includes("Database unavailable")
  );
}
