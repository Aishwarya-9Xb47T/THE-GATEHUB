/**
 * Audit Deep Learning certificate vs current progress anomaly.
 * REPORT ONLY — does not delete or revoke certificates.
 */
import "dotenv/config";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import { prisma } from "../src/utils/prisma.js";
import { resolveCanonicalUniverseId } from "../src/services/learnerScopeService.js";
import { checkLuCertificateEligibility } from "../src/services/certificateEligibilityService.js";

const OUT = path.resolve("scripts/p3-results");
mkdirSync(OUT, { recursive: true });
const courseId = "cmsq2oect00e3jn2afshiac8r";

async function main() {
  const luId = await resolveCanonicalUniverseId(courseId);
  if (!luId) throw new Error("LU not resolved");

  const enrollments = await prisma.learningUniverseEnrollment.findMany({
    where: { learningUniverseId: luId },
    include: {
      user: { select: { id: true, email: true, firstName: true, lastName: true } },
      progress: { include: { lessonProgress: true } },
    },
  });

  const certs = await prisma.learningUniverseCertificate.findMany({
    where: { learningUniverseId: luId },
    select: {
      id: true,
      certificateId: true,
      userId: true,
      status: true,
      issuedAt: true,
      revokedAt: true,
      publishVersionId: true,
    },
    orderBy: { issuedAt: "desc" },
  });

  const rows = [];
  for (const en of enrollments) {
    const activeCerts = certs.filter((c) => c.userId === en.userId && c.status === "active");
    const elig = await checkLuCertificateEligibility(en.userId, luId);
    const percent = en.progress?.percentComplete ?? 0;
    const anomaly =
      activeCerts.length > 0 && (percent < 100 || elig.eligible === false);
    rows.push({
      userId: en.userId,
      email: en.user.email,
      percent,
      isCompleted: en.isCompleted,
      completedLessons: en.progress?.lessonProgress.filter((lp) => lp.completed).length ?? 0,
      activeCertificates: activeCerts.map((c) => ({
        id: c.id,
        certificateId: c.certificateId,
        issuedAt: c.issuedAt,
      })),
      currentlyEligible: elig.eligible,
      pending: elig.pendingRequirements.slice(0, 5),
      anomaly,
      recommendedAction: anomaly
        ? "KEEP certificate (historical). Do not delete. Optional: investigate whether progress was later reset by republish/version change; revoke only via instructor revoke API if policy requires."
        : "OK",
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    courseId,
    luId,
    enrollmentCount: enrollments.length,
    certificateCount: certs.length,
    anomalyCount: rows.filter((r) => r.anomaly).length,
    rows,
    policy:
      "P3 data safety: never auto-delete certificates or reset progress because of metadata/republish drift. Report only.",
  };

  writeFileSync(path.join(OUT, "p3-deep-learning-cert-anomaly.json"), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        luId,
        anomalyCount: report.anomalyCount,
        samples: rows
          .filter((r) => r.anomaly)
          .map((r) => ({ email: r.email, percent: r.percent, certs: r.activeCertificates.map((c) => c.certificateId) })),
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
