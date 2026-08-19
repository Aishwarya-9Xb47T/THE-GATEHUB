/**
 * Diagnostic: inspect a classroom Presentation by the exact ID from the editor URL.
 *
 *   npx tsx src/scripts/inspectPresentation.ts <presentationId>
 */
import { prisma } from "../utils/prisma.js";
import { canonicalSourceRelative, getClassroomSourceKey } from "../services/classroomStudio/classroomAssetPath.js";

async function main(): Promise<void> {
  const presentationId = process.argv[2]?.trim();
  if (!presentationId) {
    console.error("Usage: npx tsx src/scripts/inspectPresentation.ts <presentationId>");
    process.exit(1);
  }

  const presentation = await prisma.presentation.findUnique({
    where: { id: presentationId },
    include: {
      slides: {
        orderBy: { order: "asc" },
        select: { id: true, order: true, title: true },
      },
    },
  });

  if (!presentation) {
    console.log("[CLASSROOM_INSPECT]", {
      presentationId,
      exists: false,
    });
    process.exit(2);
  }

  console.log("[CLASSROOM_INSPECT]", {
    presentationId: presentation.id,
    title: presentation.title,
    status: presentation.status,
    sourceType: presentation.sourceType,
    sourceUrl: presentation.sourceUrl,
    createdAt: presentation.createdAt,
    slideCount: presentation.slides.length,
    ownerUserId: presentation.instructorId,
    sourcePptxKey: getClassroomSourceKey(presentation.id),
    sourceRelative: canonicalSourceRelative(presentation.id),
    firstSlideId: presentation.slides[0]?.id ?? null,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
