import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { resolveDefaultCourseBanner } from "../src/controllers/coursesController.js";

interface AuditResult {
  coursesAudited: number;
  coursesNeedingRepair: number;
  coursesRepaired: number;
  quizzesAudited: number;
  quizzesNeedingRepair: number;
  quizzesRepaired: number;
  details: Array<{
    type: "course" | "quiz";
    id: string;
    title: string;
    oldCover: string | null;
    newCover: string | null;
    status: "valid" | "stale" | "missing" | "repaired" | "cap_exceeded";
    reason: string;
  }>;
}

export async function runMediaAudit(options: { apply?: boolean; prisma?: PrismaClient } = {}): Promise<AuditResult> {
  const prisma = options.prisma || new PrismaClient();
  const apply = Boolean(options.apply);
  const uploadRoot = path.resolve(process.cwd(), process.env.UPLOAD_DIR || "uploads");

  const result: AuditResult = {
    coursesAudited: 0,
    coursesNeedingRepair: 0,
    coursesRepaired: 0,
    quizzesAudited: 0,
    quizzesNeedingRepair: 0,
    quizzesRepaired: 0,
    details: [],
  };

  try {
    // 1. AUDIT COURSES
    const courses = await prisma.course.findMany({
      select: {
        id: true,
        title: true,
        thumbnail: true,
        bannerUrl: true,
        category: true,
        categoryRel: { select: { name: true } },
      },
    });

    result.coursesAudited = courses.length;

    for (const c of courses) {
      const categoryName = c.categoryRel?.name || (typeof c.category === "string" ? c.category : null);
      const currentCover = c.thumbnail || c.bannerUrl || null;
      let isHealthy = false;
      let failureReason = "";

      if (!currentCover) {
        failureReason = "No cover image configured";
      } else if (currentCover.startsWith("/banners/categories/")) {
        // Built-in durable category banner
        isHealthy = true;
      } else if (currentCover.startsWith("/uploads/")) {
        const localRel = currentCover.replace(/^\/uploads\//, "");
        const localPath = path.join(uploadRoot, localRel);
        if (fs.existsSync(localPath)) {
          isHealthy = true;
        } else {
          failureReason = "Local upload file missing and remote storage bandwidth cap reached";
        }
      } else if (/^https?:\/\//i.test(currentCover)) {
        // External URL
        isHealthy = true;
      }

      if (isHealthy && c.thumbnail === c.bannerUrl) {
        result.details.push({
          type: "course",
          id: c.id,
          title: c.title,
          oldCover: currentCover,
          newCover: currentCover,
          status: "valid",
          reason: "Cover is healthy and listing/detail references are synchronized",
        });
      } else {
        result.coursesNeedingRepair++;
        const replacement = isHealthy ? currentCover! : resolveDefaultCourseBanner(categoryName, c.title);

        if (apply) {
          await prisma.course.update({
            where: { id: c.id },
            data: {
              thumbnail: replacement,
              bannerUrl: replacement,
            },
          });
          result.coursesRepaired++;
          result.details.push({
            type: "course",
            id: c.id,
            title: c.title,
            oldCover: currentCover,
            newCover: replacement,
            status: "repaired",
            reason: failureReason || "Synchronized thumbnail and bannerUrl to canonical reference",
          });
        } else {
          result.details.push({
            type: "course",
            id: c.id,
            title: c.title,
            oldCover: currentCover,
            newCover: replacement,
            status: failureReason.includes("cap") ? "cap_exceeded" : "missing",
            reason: failureReason || "Thumbnail and bannerUrl out of sync",
          });
        }
      }
    }

    // 2. AUDIT QUIZZES
    const quizzes = await prisma.quiz.findMany({
      select: {
        id: true,
        title: true,
        subject: true,
        metadata: true,
      },
    });

    result.quizzesAudited = quizzes.length;

    for (const q of quizzes) {
      const meta = (q.metadata || {}) as Record<string, unknown>;
      const rawCover = (meta.coverImageUrl as string) || (meta.bannerUrl as string) || null;
      let isHealthy = false;
      let failureReason = "";

      if (!rawCover) {
        isHealthy = true; // Quizzes with no cover intentionally use theme gradients
      } else if (rawCover.startsWith("/banners/categories/")) {
        isHealthy = true;
      } else if (rawCover.startsWith("/uploads/")) {
        const localRel = rawCover.replace(/^\/uploads\//, "");
        const localPath = path.join(uploadRoot, localRel);
        if (fs.existsSync(localPath)) {
          isHealthy = true;
        } else {
          failureReason = "Referenced upload file is missing / remote storage capped";
        }
      } else if (/^https?:\/\//i.test(rawCover)) {
        isHealthy = true;
      }

      if (isHealthy) {
        result.details.push({
          type: "quiz",
          id: q.id,
          title: q.title,
          oldCover: rawCover,
          newCover: rawCover,
          status: "valid",
          reason: rawCover ? "Valid cover image" : "Intentionally configured theme gradient fallback",
        });
      } else {
        result.quizzesNeedingRepair++;
        if (apply) {
          const updatedMeta = {
            ...meta,
            coverImageUrl: null,
            bannerUrl: null,
            thumbnailUrl: null,
          };
          await prisma.quiz.update({
            where: { id: q.id },
            data: { metadata: updatedMeta as any },
          });
          result.quizzesRepaired++;
          result.details.push({
            type: "quiz",
            id: q.id,
            title: q.title,
            oldCover: rawCover,
            newCover: null,
            status: "repaired",
            reason: "Cleared broken remote upload; reverted to vibrant theme gradient",
          });
        } else {
          result.details.push({
            type: "quiz",
            id: q.id,
            title: q.title,
            oldCover: rawCover,
            newCover: null,
            status: "missing",
            reason: failureReason,
          });
        }
      }
    }
  } finally {
    if (!options.prisma) {
      await prisma.$disconnect().catch(() => {});
    }
  }

  return result;
}

// CLI Execution
if (process.argv[1] && process.argv[1].includes("audit-and-repair-media")) {
  const isApply = process.argv.includes("--apply");
  console.log("======================================================================");
  console.log(`THE GATEHUB — MEDIA AUDIT & REPAIR (${isApply ? "APPLY MODE" : "DRY RUN"})`);
  console.log("======================================================================\n");

  runMediaAudit({ apply: isApply })
    .then((res) => {
      console.log(`Courses Audited: ${res.coursesAudited} | Needing Repair: ${res.coursesNeedingRepair} | Repaired: ${res.coursesRepaired}`);
      console.log(`Quizzes Audited: ${res.quizzesAudited} | Needing Repair: ${res.quizzesNeedingRepair} | Repaired: ${res.quizzesRepaired}\n`);

      console.log("DETAILED AUDIT LOG:");
      res.details.forEach((d) => {
        console.log(`[${d.type.toUpperCase()}] "${d.title}" (${d.id})`);
        console.log(`  Status:    ${d.status}`);
        console.log(`  Old Cover: ${d.oldCover || "(none)"}`);
        console.log(`  New Cover: ${d.newCover || "(theme gradient)"}`);
        console.log(`  Reason:    ${d.reason}\n`);
      });

      if (!isApply && (res.coursesNeedingRepair > 0 || res.quizzesNeedingRepair > 0)) {
        console.log("To execute repairs safely, run with --apply flag.");
      }
    })
    .catch((err) => {
      console.error("Audit failed:", err.message);
    });
}
