import { prisma } from "../src/utils/prisma.js";
import { buildLearnerExperienceFromPublishedUniverse } from "../src/services/learningExperience/learningExperienceEngine.js";
import { parseLessonDocumentFromContent } from "../../shared/lesson-body/index.js";
import type { LuContentBlock } from "../src/services/learningUniverseSchema.js";

const universeId = "cmr1t3kg100012biy19hs4d1l";
const lessonId = "cmrayq9fa000brxx6m30void3";

const universe = await prisma.learningUniverse.findUnique({
  where: { id: universeId },
  include: {
    tracks: {
      include: {
        modules: {
          include: {
            lessons: {
              where: { id: lessonId },
              select: {
                id: true,
                title: true,
                overviewMarkdown: true,
                contentBlocks: true,
              },
            },
          },
        },
      },
    },
  },
});

const lesson = universe!.tracks.flatMap((t) => t.modules).flatMap((m) => m.lessons)[0];
const pkg = buildLearnerExperienceFromPublishedUniverse({
  id: universe!.id,
  title: universe!.title,
  description: "",
  tracks: universe!.tracks.map((t) => ({
    id: t.id,
    title: t.title,
    modules: t.modules.map((m) => ({
      id: m.id,
      title: m.title,
      lessons: m.lessons.map((l) => ({
        ...l,
        contentBlocks: (l.contentBlocks as LuContentBlock[]) ?? [],
        videos: [],
        practice: null,
        quiz: null,
        project: null,
        resources: [],
      })),
    })),
  })),
});

console.log("\n=== ALL STEPS ===");
for (const step of pkg.lessons[lessonId].steps) {
  const body = String(step.payload.body ?? step.payload.text ?? step.payload.markdown ?? "");
  const nodes = parseLessonDocumentFromContent(step.payload).nodes.map((n) => n.type).join(",");
  console.log({
    id: step.id,
    kind: step.kind,
    title: step.title,
    payloadTitle: step.payload.title,
    bodyLen: body.length,
    hasGfx: body.includes("\\includegraphics"),
    nodes,
  });
}

const overview = pkg.lessons[lessonId].steps.find((s) => s.kind === "overview");
const summary = pkg.lessons[lessonId].steps.find(
  (s) => String(s.payload.title ?? s.title).trim().toLowerCase() === "summary"
);

console.log("\n=== COMPARE ===");
for (const [name, step] of [["Overview", overview], ["Summary", summary]] as const) {
  if (!step) {
    console.log(name, "MISSING");
    continue;
  }
  const doc = parseLessonDocumentFromContent(step.payload);
  console.log(name, {
    kind: step.kind,
    nodes: doc.nodes.map((n) => n.type),
    hasImage: doc.nodes.some((n) => n.type === "image"),
  });
}

await prisma.$disconnect();
