/**
 * Publish "Computer Networking Mastery" sample course for E2E testing.
 * Run: npx tsx backend/publish-networking-mastery.ts
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "./src/utils/prisma.js";
import { parseLearningUniverseLatex } from "./src/controllers/learning-universe-parser.js";
import { publishLearningUniverse } from "./src/controllers/learning-universe-controller.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE = path.join(__dirname, "samples", "computer-networking-mastery.tex");

async function main() {
  if (!fs.existsSync(SAMPLE)) {
    console.error("Sample not found:", SAMPLE);
    process.exit(1);
  }

  const tex = fs.readFileSync(SAMPLE, "utf8");
  const parsed = parseLearningUniverseLatex(tex);
  const lessons = parsed.tracks.flatMap((t) => t.modules.flatMap((m) => m.lessons));
  console.log(`Parsed: ${parsed.tracks.length} tracks, ${lessons.length} lessons`);
  console.log(`Title: ${parsed.universe.title}`);

  const instructor =
    (await prisma.user.findFirst({ where: { role: "instructor" } })) ||
    (await prisma.user.findFirst({ where: { role: "admin" } })) ||
    (await prisma.user.findFirst());
  if (!instructor) {
    console.error("No user found to publish as instructor");
    process.exit(1);
  }

  const existing = await prisma.learningUniverse.findFirst({
    where: { title: parsed.universe.title, instructorId: instructor.id },
  });

  const universe = await publishLearningUniverse(tex, instructor.id, undefined, {
    universeId: existing?.id,
  });

  console.log("\nPublished successfully!");
  console.log(`  ID: ${universe.id}`);
  console.log(`  Title: ${universe.title}`);
  console.log(`  Status: ${universe.status}`);
  console.log(`  Lessons in DB: ${await prisma.learningUniverseLesson.count({ where: { module: { track: { learningUniverseId: universe.id } } } })}`);
  console.log(`  Projects: ${await prisma.learningUniverseProject.count({ where: { lesson: { module: { track: { learningUniverseId: universe.id } } } } })}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
