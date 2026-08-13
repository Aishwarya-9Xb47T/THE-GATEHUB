import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
});

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Test connection but don't crash
prisma.$connect()
  .then(() => console.log("[PRISMA] Database connected successfully"))
  .catch((err: any) => {
    console.error("[PRISMA] Database connection failed:", err.message);
    console.warn("[PRISMA] Ensure your DATABASE_URL is correct and the database is running.");
  });
