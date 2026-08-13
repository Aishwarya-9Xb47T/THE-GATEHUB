/**
 * Compare repo migrations vs schema.prisma on a temporary shadow database.
 * Does NOT modify the application database.
 */
import "dotenv/config";
import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";

function withDatabase(url: string, database: string) {
  const u = new URL(url);
  u.pathname = `/${database}`;
  return u.toString();
}

async function main() {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL missing");

  const shadowName = `gatehub_migrate_shadow_${Date.now()}`;
  const adminUrl = withDatabase(base, "postgres");
  const shadowUrl = withDatabase(base, shadowName);

  const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${shadowName}"`);
  } finally {
    await admin.$disconnect();
  }

  try {
    console.log("Applying migrations to shadow database...");
    execSync(`npx prisma migrate deploy`, {
      env: { ...process.env, DATABASE_URL: shadowUrl },
      stdio: "inherit",
      cwd: process.cwd(),
    });

    const diff = execSync(
      `npx prisma migrate diff --from-url ${JSON.stringify(shadowUrl)} --to-schema-datamodel prisma/schema.prisma --script`,
      {
        env: { ...process.env },
        encoding: "utf8",
        cwd: process.cwd(),
        maxBuffer: 20 * 1024 * 1024,
      }
    );

    const trimmed = (diff || "").trim();
    const empty =
      !trimmed ||
      trimmed === "-- This is an empty migration." ||
      /^-- This is an empty migration\.\s*$/m.test(trimmed);

    console.log(
      JSON.stringify(
        {
          shadowDatabase: shadowName,
          migrationsMatchSchema: empty,
          remainingSqlLength: trimmed.length,
          remainingSqlPreview: empty ? null : trimmed.slice(0, 5000),
        },
        null,
        2
      )
    );
  } finally {
    const drop = new PrismaClient({ datasources: { db: { url: adminUrl } } });
    try {
      await drop.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${shadowName}" WITH (FORCE)`);
    } catch {
      await drop.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${shadowName}"`);
    } finally {
      await drop.$disconnect();
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
