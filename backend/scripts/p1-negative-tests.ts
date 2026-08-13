import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/utils/prisma.js";
import { resolveCanonicalUniverseId } from "../src/services/learnerScopeService.js";

const BASE = process.env.API_BASE || "http://localhost:5000/api";
const courseId = "cmsq2oect00e3jn2afshiac8r";

function mint(user: { id: string; email: string; role: string; tokenVersion: number }) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion },
    process.env.JWT_SECRET!,
    { expiresIn: "1h" }
  );
}

async function main() {
  const luId = (await resolveCanonicalUniverseId(courseId))!;
  const enrollment = await prisma.learningUniverseEnrollment.findFirst({
    where: { learningUniverseId: luId },
    include: { user: { select: { id: true, email: true, role: true, tokenVersion: true } }, progress: true },
  });
  const token = mint(enrollment!.user);
  const pct = enrollment!.progress?.percentComplete ?? 0;

  const zip = await fetch(`${BASE}/learning-universes/${luId}/download-complete`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log("ZIP gated download", {
    status: zip.status,
    percent: pct,
    expectBlocked: pct < 100,
  });
  if (pct < 100 && zip.status === 200) {
    throw new Error("ZIP should be blocked when incomplete");
  }

  // Unauthorized: other student cannot claim this user's cert path via weird id - smoke auth
  const other = await prisma.user.findFirst({
    where: { role: "student", id: { not: enrollment!.userId } },
    select: { id: true, email: true, role: true, tokenVersion: true },
  });
  if (other) {
    const otherToken = mint(other);
    const certs = await prisma.learningUniverseCertificate.findFirst({
      where: { userId: enrollment!.userId, learningUniverseId: luId, status: "active" },
    });
    if (certs) {
      const dl = await fetch(`${BASE}/certificates/lu/${certs.id}/download`, {
        headers: { Authorization: `Bearer ${otherToken}` },
      });
      console.log("other student cert download", dl.status);
      if (dl.status === 200) throw new Error("Unauthorized cert download allowed");
    }
  }

  console.log("=== NEGATIVE TESTS PASS ===");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
