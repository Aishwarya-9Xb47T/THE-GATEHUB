/**
 * Complete one required step on Deep Learning and verify dashboard/player/My Courses agree.
 */
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/utils/prisma.js";
import { resolveCanonicalUniverseId } from "../src/services/learnerScopeService.js";
import { getLearnerExperience } from "../src/controllers/learningExperienceController.js";

const BASE = process.env.API_BASE || "http://localhost:5000/api";
const courseId = "cmsq2oect00e3jn2afshiac8r";

function mint(user: { id: string; email: string; role: string; tokenVersion: number }) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion },
    process.env.JWT_SECRET!,
    { expiresIn: "1h" }
  );
}

async function api(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function main() {
  const luId = (await resolveCanonicalUniverseId(courseId))!;
  const enrollment = await prisma.learningUniverseEnrollment.findFirst({
    where: { learningUniverseId: luId },
    include: { user: { select: { id: true, email: true, role: true, tokenVersion: true } } },
  });
  if (!enrollment) throw new Error("no enrollment");
  const token = mint(enrollment.user);
  const exp = await getLearnerExperience(luId, enrollment.userId);
  if (!exp) throw new Error("no experience");

  // Find first required incomplete step
  let target: { lessonId: string; stepId: string } | null = null;
  for (const track of exp.outline.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        const lessonExp = exp.lessons[lesson.id];
        if (!lessonExp) continue;
        for (const step of lessonExp.steps) {
          if (step.kind === "next-lesson") continue;
          if (step.progressRule.requiredForCompletion) {
            target = { lessonId: lesson.id, stepId: step.id };
            break;
          }
        }
        if (target) break;
      }
      if (target) break;
    }
    if (target) break;
  }
  if (!target) throw new Error("no required step found");

  console.log("Completing step", target);
  const patch = await api(`/learning-universes/${courseId}/step-progress`, token, {
    method: "PATCH",
    body: JSON.stringify({
      lessonId: target.lessonId,
      stepId: target.stepId,
      completed: true,
      visited: true,
      progress: 100,
    }),
  });
  console.log("step patch", patch.status, {
    percent: patch.json.percentComplete ?? patch.json.data?.percentComplete,
  });

  const player = await api(`/learning-universes/${courseId}/progress`, token);
  const dash = await api(`/learning/my`, token);
  const mine = await api(`/enrollments/my`, token);
  const dashItem = (dash.json.items || []).find((i: { id: string }) => i.id === courseId || i.id === luId);
  const card = (mine.json.enrollments || []).find((e: { course: { id: string } }) => e.course.id === courseId);

  const pct = player.json.percentComplete;
  console.log({
    player: pct,
    dashboard: dashItem?.progressPercent,
    myCourses: card?.progress?.percent,
    continueDash: dashItem?.continueUrl,
    continueMine: card?.continueUrl,
  });

  if (dashItem?.progressPercent !== pct || card?.progress?.percent !== pct) {
    throw new Error("Progress mismatch after step completion");
  }
  if (pct <= 0) {
    console.warn("Percent still 0 — check required-step rules / step patch response shape");
  }
  console.log("=== STEP PROGRESS SYNC PASS ===");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
