/**
 * Seed AssessQuestionType registry rows.
 * Run: npx tsx src/assessment-platform/scripts/seed-question-types.ts
 */

import { prisma } from "../../utils/prisma.js";

const TYPES = [
  { slug: "multiple_choice", label: "Single Choice (MCQ)", category: "choice", graderKey: "multiple_choice", rendererKey: "multiple_choice" },
  { slug: "multiple_select", label: "Multiple Select", category: "choice", graderKey: "multiple_select", rendererKey: "multiple_select" },
  { slug: "true_false", label: "True / False", category: "choice", graderKey: "true_false", rendererKey: "true_false" },
  { slug: "fill_blank", label: "Fill in the Blank", category: "text", graderKey: "fill_blank", rendererKey: "fill_blank" },
  { slug: "numerical", label: "Numerical", category: "text", graderKey: "numerical", rendererKey: "numerical" },
  { slug: "matching", label: "Match the Following", category: "interactive", graderKey: "matching", rendererKey: "matching" },
  { slug: "ordering", label: "Ordering", category: "interactive", graderKey: "ordering", rendererKey: "ordering" },
  { slug: "sequence", label: "Sequence", category: "interactive", graderKey: "sequence", rendererKey: "sequence" },
  { slug: "poll", label: "Poll", category: "choice", graderKey: "poll", rendererKey: "poll" },
  { slug: "short_answer", label: "Short Answer", category: "text", graderKey: "short_answer", rendererKey: "short_answer" },
  { slug: "essay", label: "Essay", category: "text", graderKey: "essay", rendererKey: "essay" },
  { slug: "image_based", label: "Image Based", category: "media", graderKey: "image_based", rendererKey: "image_based" },
  { slug: "video_based", label: "Video Based", category: "media", graderKey: "video_based", rendererKey: "video_based" },
  { slug: "audio_based", label: "Audio Based", category: "media", graderKey: "audio_based", rendererKey: "audio_based" },
  { slug: "hotspot", label: "Hotspot", category: "interactive", graderKey: "hotspot", rendererKey: "hotspot" },
  { slug: "matrix", label: "Matrix", category: "interactive", graderKey: "matrix", rendererKey: "matrix" },
  { slug: "coding", label: "Coding", category: "code", graderKey: "coding", rendererKey: "coding" },
  { slug: "debugging", label: "Debugging", category: "code", graderKey: "debugging", rendererKey: "debugging" },
  { slug: "predict_output", label: "Predict Output", category: "code", graderKey: "predict_output", rendererKey: "predict_output" },
  { slug: "sql", label: "SQL", category: "code", graderKey: "sql", rendererKey: "sql" },
  { slug: "case_study", label: "Case Study", category: "composite", graderKey: "case_study", rendererKey: "case_study" },
  { slug: "scenario", label: "Scenario", category: "composite", graderKey: "scenario", rendererKey: "scenario" },
] as const;

async function main() {
  for (const t of TYPES) {
    await prisma.assessQuestionType.upsert({
      where: { slug: t.slug },
      create: { ...t, schema: {} },
      update: { label: t.label, category: t.category, graderKey: t.graderKey, rendererKey: t.rendererKey, enabled: true },
    });
  }
  console.log(`Seeded ${TYPES.length} question types.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
