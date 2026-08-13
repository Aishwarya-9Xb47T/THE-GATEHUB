import "dotenv/config";
import { prisma } from "../src/utils/prisma.js";

async function main() {
  const active = await prisma.learningUniverseCertificate.findMany({
    where: { status: "active" },
    select: {
      id: true,
      certificateId: true,
      userId: true,
      learningUniverseId: true,
      publishVersionId: true,
      issuedAt: true,
      user: { select: { email: true } },
      learningUniverse: { select: { title: true } },
    },
    orderBy: { issuedAt: "asc" },
  });

  const keyCounts = new Map<string, typeof active>();
  for (const c of active) {
    const key = `${c.userId}::${c.learningUniverseId}`;
    const arr = keyCounts.get(key) ?? [];
    arr.push(c);
    keyCounts.set(key, arr);
  }

  const dups = [...keyCounts.entries()].filter(([, arr]) => arr.length > 1);
  console.log(
    JSON.stringify(
      {
        activeTotal: active.length,
        uniqueUserLuPairs: keyCounts.size,
        duplicatePairCount: dups.length,
        duplicates: dups.map(([key, arr]) => ({
          key,
          count: arr.length,
          email: arr[0]?.user.email,
          luTitle: arr[0]?.learningUniverse.title,
          certificates: arr.map((c) => ({
            id: c.id,
            certificateId: c.certificateId,
            publishVersionId: c.publishVersionId,
            issuedAt: c.issuedAt,
          })),
        })),
      },
      null,
      2
    )
  );

  // Also check user+LU+publishVersion uniqueness (current findFirst scope)
  const keyPv = new Map<string, number>();
  for (const c of active) {
    const key = `${c.userId}::${c.learningUniverseId}::${c.publishVersionId ?? "null"}`;
    keyPv.set(key, (keyPv.get(key) ?? 0) + 1);
  }
  const dupsPv = [...keyPv.entries()].filter(([, n]) => n > 1);
  console.log("duplicate user+LU+publishVersion pairs:", dupsPv.length, dupsPv.slice(0, 5));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
