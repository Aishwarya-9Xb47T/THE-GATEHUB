/**
 * P2 verification: certificate rules, browse continue, free products, verify page.
 */
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/utils/prisma.js";
import { resolveCanonicalUniverseId } from "../src/services/learnerScopeService.js";
import { resolveCompletionRules } from "../src/services/learningExperience/completionRulesResolve.js";
import { mergePublishStructuredData } from "../src/services/productRoutingService.js";

const BASE = process.env.API_BASE || "http://localhost:5000/api";
const courseId = "cmsq2oect00e3jn2afshiac8r";

function mint(user: { id: string; email: string; role: string; tokenVersion: number }) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion },
    process.env.JWT_SECRET!,
    { expiresIn: "1h" }
  );
}

async function api(path: string, token?: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function main() {
  console.log("=== P2.1 mergePublishStructuredData preserves completionRules ===");
  const merged = mergePublishStructuredData(
    {
      completionRules: { certificateEligible: false, minimumProgressPercent: 100, requireAllRequiredSteps: true },
      aiArchitect: { interview: { courseInfo: { certificationEligible: false } } },
      linkedCourseId: "course-1",
    },
    { learnerExperience: { completionRules: { certificateEligible: true } }, title: "x" }
  );
  console.log({
    preservedEligible: (merged.completionRules as { certificateEligible: boolean })?.certificateEligible,
    preservedArchitect: Boolean(merged.aiArchitect),
    linkedCourseId: merged.linkedCourseId,
  });
  if ((merged.completionRules as { certificateEligible: boolean })?.certificateEligible !== false) {
    throw new Error("completionRules.certificateEligible wiped on merge");
  }

  console.log("=== P2.1 resolveCompletionRules architect OFF ===");
  const off = resolveCompletionRules({
    aiArchitect: { interview: { courseInfo: { certificationEligible: false } } },
    learnerExperience: { completionRules: { certificateEligible: true } },
  });
  console.log(off);
  if (off.certificateEligible !== false) throw new Error("Architect OFF should win over cached LE true");

  const luId = (await resolveCanonicalUniverseId(courseId))!;
  const lu = await prisma.learningUniverse.findUnique({ where: { id: luId }, select: { structuredData: true, title: true, price: true, status: true } });
  const rules = resolveCompletionRules(lu?.structuredData);
  console.log("Deep Learning rules", { title: lu?.title, rules });

  const enrollment = await prisma.learningUniverseEnrollment.findFirst({
    where: { learningUniverseId: luId },
    include: { user: { select: { id: true, email: true, role: true, tokenVersion: true } } },
  });
  const token = mint(enrollment!.user);

  console.log("=== P2.6 Browse continue via enrollments/my ===");
  const mine = await api("/enrollments/my", token);
  const card = (mine.json.enrollments || []).find((e: { course: { id: string } }) => e.course.id === courseId);
  console.log({ continueUrl: card?.continueUrl, percent: card?.progress?.percent });
  if (!card?.continueUrl?.includes("/learn/")) throw new Error("continueUrl missing deep link");

  console.log("=== P2.5 Verify certificate ===");
  const cert = await prisma.learningUniverseCertificate.findFirst({
    where: { userId: enrollment!.userId, learningUniverseId: luId, status: "active" },
  });
  if (cert) {
    const ok = await api(`/certificates/verify/${cert.certificateId}`);
    console.log("valid verify", ok.status, {
      student: ok.json.studentName,
      course: ok.json.courseTitle,
      status: ok.json.status,
    });
    if (ok.status !== 200 || !ok.json.studentName || ok.json.studentName.includes("Sample")) {
      throw new Error("Verify returned sample/invalid data");
    }
    const bad = await api(`/certificates/verify/DOES-NOT-EXIST-XYZ`);
    console.log("invalid verify", bad.status, bad.json.error || bad.json);
    if (bad.status === 200 && bad.json.valid) throw new Error("Invalid cert should not verify");
  }

  console.log("=== P2.8 Product sync free publish flag ===");
  const products = await prisma.product.findMany({
    where: { OR: [{ courseId }, { learningUniverseId: luId }] },
    select: { id: true, courseId: true, learningUniverseId: true, price: true, published: true, displayName: true },
  });
  console.log(products);

  console.log("=== P2.7 Free published courses in premium ID set ===");
  const { resolvePublishedPremiumCourseIds } = await import("../src/services/productRoutingService.js");
  const ids = await resolvePublishedPremiumCourseIds();
  const freePublished = await prisma.course.findMany({
    where: { status: "published", price: 0 },
    select: { id: true, title: true },
  });
  console.log({
    freePublished: freePublished.map((c) => ({
      ...c,
      inCatalog: ids.includes(c.id),
    })),
  });

  console.log("=== P2 VERIFY PASS ===");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
