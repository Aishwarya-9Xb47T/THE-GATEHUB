import { prisma } from "../src/utils/prisma.js";
import { getLearnerExperience } from "../src/controllers/learningExperienceController.js";

const pkg = await getLearnerExperience("cmr1t3kg100012biy19hs4d1l");
const lesson = pkg?.lessons["cmrayq9fa000brxx6m30void3"];
const summary = lesson?.steps.find(
  (s) => String(s.payload.title ?? "").toLowerCase() === "summary"
);
const body = String(summary?.payload.body ?? "");
console.log("version", pkg?.version);
console.log("summary has gfx", body.includes("includegraphics"));
console.log("summary body", body.slice(0, 120));
await prisma.$disconnect();
